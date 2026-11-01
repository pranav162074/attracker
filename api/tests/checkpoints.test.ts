import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { pool, closePool } from '../src/db/pool.ts';
import { matchSubjects, nameTokens } from '../src/checkpoints/sheet.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';
import { createdEmails, newUser, testIpPrefix } from './helpers.ts';
import { GRID, SUBJECTS } from './fixtures/semV.ts';
import type { SubjectKey } from './fixtures/semV.ts';
import { attendanceSheet } from './fixtures/sheet.ts';

afterAll(async () => {
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1', [`${testIpPrefix}%`]);
  }
  await closePool();
});

const HOLIDAYS = ['2026-08-15', '2026-08-21', '2026-08-25', '2026-09-04', '2026-09-14', '2026-10-02', '2026-10-20'];

const setUp = async () => {
  const user = await newUser();
  const timetable = (await user.post('/timetables', { name: 'College – Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75, condonationPercent: 65 }))
    .body.timetable;
  const base = `/timetables/${timetable.id}`;
  const ids = {} as Record<SubjectKey, number>;
  for (const subject of SUBJECTS) ids[subject.key] = (await user.post(`${base}/subjects`, { name: subject.name, kind: subject.kind })).body.subject.id;
  await user.put(`${base}/grid`, { effectiveFrom: '2026-07-20', slots: GRID.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] })) });
  await user.post(`${base}/calendar/bulk`, { days: HOLIDAYS.map((startsOn) => ({ kind: 'holiday', startsOn })) });
  await user.post(`${base}/start`);
  return { user, base, ids };
};

const upload = (token: string, base: string, registration: string | null, file: Buffer = attendanceSheet()) =>
  request(app)
    .post(`${base}/checkpoints/sheet${registration === null ? '' : `?registration=${encodeURIComponent(registration)}`}`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/vnd.ms-excel')
    .send(file);

describe('matching sheet columns to subjects', () => {
  it('ignores course codes and bracketed notes', () => {
    expect(nameTokens('22CT1150-Advanced Data Structures & Algorithms (PROFESSIONAL ELECTIVE-I)')).toEqual(['advanced', 'data', 'structures', 'algorithms']);
  });

  it('never mixes up a theory subject and its lab', () => {
    const matched = matchSubjects(
      [
        { code: 'A', name: 'Object Oriented Analysis and Design Lab', held: 30, attended: 18 },
        { code: 'B', name: 'Object Oriented Analysis and Design', held: 32, attended: 19 },
      ],
      [
        { id: 1, name: 'Object Oriented Analysis and Design', shortName: null },
        { id: 2, name: 'OOAD Lab', shortName: 'OOADL' },
      ]
    );
    expect(matched.map((m) => m.subjectId)).toEqual([2, 1]);
  });

  it('leaves a lab column unmatched rather than giving it to the theory subject', () => {
    const matched = matchSubjects(
      [{ code: 'A', name: 'Computer Networks Lab', held: 30, attended: 27 }],
      [{ id: 1, name: 'Computer Networks', shortName: 'CN' }]
    );
    expect(matched[0]!.subjectId).toBeNull();
  });

  it('uses short names and leaves unknown columns unmatched', () => {
    const matched = matchSubjects(
      [
        { code: null, name: 'Data Warehousing and Data Mining', held: 1, attended: 1 },
        { code: null, name: 'Quantum Basket Weaving', held: 1, attended: 1 },
      ],
      [{ id: 7, name: 'DWDM', shortName: 'DWDM' }]
    );
    expect(matched.map((m) => m.subjectId)).toEqual([7, null]);
  });
});

describe.skipIf(skipWithoutDatabase)('official numbers from the class sheet', () => {
  it('reads only the student’s own row, matches every subject and works out the free hours', async () => {
    const { user, base, ids } = await setUp();
    const res = await upload(user.token, base, 'test0000015');
    expect(res.status).toBe(200);
    const { preview } = res.body;
    expect(preview).toMatchObject({ registration: 'TEST0000015', totals: { held: 246, attended: 150 }, freeHeld: 8, freeAttended: 8, unmatchedSubjects: [] });
    expect(preview.subjects.map((s: { subjectId: number; held: number; attended: number }) => [s.subjectId, s.held, s.attended])).toEqual([
      [ids.DWDM, 32, 15],
      [ids.CN, 26, 18],
      [ids.OOAD, 32, 19],
      [ids.ADSA, 28, 15],
      [ids.OOADL, 30, 18],
      [ids.CNL, 30, 27],
      [ids.COI, 16, 10],
      [ids.PCSS, 21, 9],
      [ids.OE, 23, 11],
    ]);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/Classmate|324103311001|325103311L01/);
  });

  it('finds registration numbers the sheet stores as numbers or with letters', async () => {
    const { user, base } = await setUp();
    expect((await upload(user.token, base, '324103311001')).body.preview.totals).toEqual({ held: 246, attended: 208 });
    expect((await upload(user.token, base, '325103311l01')).body.preview.subjects).toHaveLength(9);
  });

  it('turns the sheet into the official numbers, reproducing 246 held, 150 attended, 60.97%', async () => {
    const { user, base } = await setUp();
    const { preview } = (await upload(user.token, base, 'TEST0000015')).body;
    const saved = await user.post(`${base}/checkpoints`, {
      asOf: '2026-09-30',
      source: 'sheet',
      freeHeld: preview.freeHeld,
      freeAttended: preview.freeAttended,
      subjects: preview.subjects.map((s: { subjectId: number; held: number; attended: number }) => ({ subjectId: s.subjectId, held: s.held, attended: s.attended })),
    });
    expect(saved.status).toBe(201);
    expect(saved.body.checkpoint).toMatchObject({ asOf: '2026-09-30', source: 'sheet', freeHeld: 8 });

    const { summary } = (await user.get(`${base}/summary?asOf=2026-09-30`)).body;
    expect(summary.overall).toMatchObject({ held: 246, attended: 150, percentText: '60.97', zone: 'below', bestText: '77.51' });
    expect(summary.checkpoint).toEqual({ asOf: '2026-09-30' });
  });

  it('explains files and requests it cannot use', async () => {
    const { user, base } = await setUp();
    const cases: Array<[string | null, Buffer, number, string]> = [
      [null, attendanceSheet(), 400, 'Add your registration number, like ?registration=324103311015'],
      ['NOBODY123', attendanceSheet(), 404, 'Registration number NOBODY123 is not in this sheet'],
      ['TEST0000015', Buffer.from('this is not a spreadsheet at all, just text\nwith lines'), 400, 'This does not look like an attendance sheet. It needs a registration number column and Held (H) / Attended (A) columns for each subject.'],
      ['TEST0000015', attendanceSheet().subarray(0, 2000), 400, 'This file could not be read as a spreadsheet'],
    ];
    for (const [registration, file, status, message] of cases) {
      const res = await upload(user.token, base, registration, file);
      expect(res.status, message).toBe(status);
      expect(res.body.message).toBe(message);
    }
    expect((await upload(user.token, base, 'TEST0000015', Buffer.alloc(3 * 1024 * 1024, 1))).status).toBe(413);
  });
});

describe.skipIf(skipWithoutDatabase)('official numbers typed in', () => {
  it('are saved, replaced on the same date, listed newest first and deleted', async () => {
    const { user, base, ids } = await setUp();
    const first = await user.post(`${base}/checkpoints`, { asOf: '2026-08-31', subjects: [{ subjectId: ids.CN, held: 14, attended: 12 }] });
    expect(first.status).toBe(201);
    expect(first.body.checkpoint).toMatchObject({ source: 'manual', freeHeld: 0 });
    await user.post(`${base}/checkpoints`, { asOf: '2026-09-30', subjects: [{ subjectId: ids.CN, held: 26, attended: 18 }] });
    const replaced = await user.post(`${base}/checkpoints`, { asOf: '2026-09-30', subjects: [{ subjectId: ids.CN, held: 26, attended: 20 }] });
    expect(replaced.status).toBe(201);

    const list = (await user.get(`${base}/checkpoints`)).body.checkpoints;
    expect(list.map((c: { asOf: string }) => c.asOf)).toEqual(['2026-09-30', '2026-08-31']);
    expect(list[0].subjects).toEqual([{ subjectId: ids.CN, held: 26, attended: 20 }]);

    expect((await user.delete(`${base}/checkpoints/${list[0].id}`)).status).toBe(204);
    expect((await user.get(`${base}/checkpoints`)).body.checkpoints).toHaveLength(1);
    expect((await user.delete(`${base}/checkpoints/${list[0].id}`)).status).toBe(404);
  });

  it('explain what is wrong', async () => {
    const { user, base, ids } = await setUp();
    const other = (await user.post('/timetables', { name: 'Dance', startsOn: '2026-07-20' })).body.timetable;
    const foreign = (await user.post(`/timetables/${other.id}/subjects`, { name: 'Bharatanatyam' })).body.subject.id;
    const cases: Array<[object, string]> = [
      [{ asOf: '2026-09-30', subjects: [{ subjectId: ids.CN, held: 10, attended: 11 }] }, 'attended cannot be more than held'],
      [{ asOf: '2026-09-30', subjects: [{ subjectId: ids.CN, held: 10, attended: 5 }, { subjectId: ids.CN, held: 10, attended: 5 }] }, 'Each subject can appear only once'],
      [{ asOf: '2026-09-30', subjects: [] }, 'Give the numbers for at least one subject'],
      [{ asOf: '2026-09-30', freeHeld: 3, freeAttended: 5, subjects: [{ subjectId: ids.CN, held: 1, attended: 1 }] }, 'freeAttended cannot be more than freeHeld'],
      [{ asOf: '2026-09-30', subjects: [{ subjectId: ids.CN, held: -1, attended: 0 }] }, 'held cannot be negative'],
      [{ asOf: '2026-09-30', subjects: [{ subjectId: foreign, held: 1, attended: 1 }] }, `Subject ${foreign} is not part of this timetable`],
      [{ asOf: '2026-09-30', subjects: [{ subjectId: ids.LIB, held: 1, attended: 1 }] }, 'Library does not count for attendance'],
      [{ asOf: '2026-07-01', subjects: [{ subjectId: ids.CN, held: 1, attended: 1 }] }, 'asOf must be within the timetable’s dates'],
    ];
    for (const [body, message] of cases) {
      const res = await user.post(`${base}/checkpoints`, body);
      expect(res.status, message).toBe(400);
      expect(res.body.message).toBe(message);
    }
  });

  it('cannot be dated in the future', async () => {
    const user = await newUser();
    const timetable = (await user.post('/timetables', { name: 'Next year', startsOn: '2030-07-01', endsOn: '2030-11-30' })).body.timetable;
    const subject = (await user.post(`/timetables/${timetable.id}/subjects`, { name: 'Maths' })).body.subject;
    const res = await user.post(`/timetables/${timetable.id}/checkpoints`, { asOf: '2030-08-01', subjects: [{ subjectId: subject.id, held: 1, attended: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Official numbers cannot be dated in the future');
  });

  it('are private', async () => {
    const { user: owner, base, ids } = await setUp();
    const saved = (await owner.post(`${base}/checkpoints`, { asOf: '2026-09-30', subjects: [{ subjectId: ids.CN, held: 26, attended: 18 }] })).body.checkpoint;
    const intruder = await newUser('intruder');
    for (const res of [
      await intruder.get(`${base}/checkpoints`),
      await intruder.post(`${base}/checkpoints`, { asOf: '2026-09-30', subjects: [{ subjectId: ids.CN, held: 1, attended: 1 }] }),
      await upload(intruder.token, base, 'TEST0000015'),
      await intruder.delete(`${base}/checkpoints/${saved.id}`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect((await owner.get(`${base}/checkpoints`)).body.checkpoints[0].subjects[0].attended).toBe(18);
  });
});
