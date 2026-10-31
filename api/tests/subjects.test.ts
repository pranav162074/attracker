import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../src/db/pool.ts';
import { MAX_SUBJECTS, PALETTE } from '../src/subjects/repo.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';
import { createdEmails, newUser, testIpPrefix } from './helpers.ts';

afterAll(async () => {
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1', [`${testIpPrefix}%`]);
  }
  await closePool();
});

const setUp = async () => {
  const user = await newUser();
  const timetable = (await user.post('/timetables', { name: 'College', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75 })).body
    .timetable;
  const base = `/timetables/${timetable.id}/subjects`;
  return { user, timetable, base };
};

describe.skipIf(skipWithoutDatabase)('subjects', () => {
  it('are created as theory that counts per period unless told otherwise', async () => {
    const { user, timetable, base } = await setUp();
    const res = await user.post(base, { name: ' Data Warehousing and Data Mining ', shortName: 'DWDM' });

    expect(res.status).toBe(201);
    expect(res.body.subject).toEqual({
      id: expect.any(Number),
      timetableId: timetable.id,
      name: 'Data Warehousing and Data Mining',
      shortName: 'DWDM',
      kind: 'theory',
      countsAttendance: true,
      countPerSession: false,
      colour: PALETTE[0],
      archived: false,
      createdAt: expect.any(String),
    });
  });

  it('cover labs, sessions, and periods that do not count', async () => {
    const { user, base } = await setUp();
    const lab = await user.post(base, { name: 'OOAD Lab', kind: 'lab' });
    const library = await user.post(base, { name: 'Library', kind: 'other' });
    const sports = await user.post(base, { name: 'Sports', kind: 'other', countsAttendance: true });
    const dance = await user.post(base, { name: 'Bharatanatyam', countPerSession: true });

    expect(lab.body.subject).toMatchObject({ kind: 'lab', countsAttendance: true, countPerSession: false });
    expect(library.body.subject).toMatchObject({ kind: 'other', countsAttendance: false });
    expect(sports.body.subject).toMatchObject({ kind: 'other', countsAttendance: true });
    expect(dance.body.subject).toMatchObject({ kind: 'theory', countPerSession: true });
  });

  it('get different colours until the palette runs out, then the least used one', async () => {
    const { user, base } = await setUp();
    const colours: string[] = [];
    for (let i = 0; i < PALETTE.length + 1; i += 1) colours.push((await user.post(base, { name: `Subject ${i}` })).body.subject.colour);
    expect(colours.slice(0, PALETTE.length)).toEqual([...PALETTE]);
    expect(colours[PALETTE.length]).toBe(PALETTE[0]);

    const chosen = await user.post(base, { name: 'Chosen', colour: '#ABCDEF' });
    expect(chosen.body.subject.colour).toBe('#abcdef');
  });

  it('are listed in the order they were added', async () => {
    const { user, base } = await setUp();
    for (const name of ['DWDM', 'CN', 'OOAD']) await user.post(base, { name });
    const list = await user.get(base);
    expect(list.status).toBe(200);
    expect(list.body.subjects.map((s: { name: string }) => s.name)).toEqual(['DWDM', 'CN', 'OOAD']);
  });

  it('explain what is wrong', async () => {
    const { user, base } = await setUp();
    const cases: Array<[object, string]> = [
      [{}, 'Name is required'],
      [{ name: '  ' }, 'Name is required'],
      [{ name: 'x'.repeat(81) }, 'Name must be at most 80 characters'],
      [{ name: 'A', shortName: 'x'.repeat(13) }, 'Short name must be at most 12 characters'],
      [{ name: 'A', kind: 'seminar' }, 'Kind must be theory, lab or other'],
      [{ name: 'A', colour: 'red' }, 'Colour must look like #2563eb'],
      [{ name: 'A', countPerSession: 'yes' }, 'countPerSession must be true or false'],
      [{ name: 'A', timetableId: 1 }, 'Unrecognized key: "timetableId"'],
    ];
    for (const [body, message] of cases) {
      const res = await user.post(base, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.message, JSON.stringify(body)).toBe(message);
    }
  });

  it('need unique names within a timetable, ignoring case', async () => {
    const { user, base } = await setUp();
    await user.post(base, { name: 'Computer Networks' });
    const again = await user.post(base, { name: 'computer networks' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('name_taken');

    const other = (await user.post('/timetables', { name: 'Tuition', startsOn: '2026-07-20' })).body.timetable;
    expect((await user.post(`/timetables/${other.id}/subjects`, { name: 'Computer Networks' })).status).toBe(201);
  });

  it('can be changed, archived and brought back', async () => {
    const { user, base } = await setUp();
    const { id } = (await user.post(base, { name: 'CN', shortName: 'CN' })).body.subject;

    const changed = await user.patch(`${base}/${id}`, { name: 'Computer Networks', shortName: null, kind: 'lab', countPerSession: true });
    expect(changed.status).toBe(200);
    expect(changed.body.subject).toMatchObject({ name: 'Computer Networks', shortName: null, kind: 'lab', countPerSession: true });

    expect((await user.patch(`${base}/${id}`, { archived: true })).body.subject.archived).toBe(true);
    expect((await user.get(base)).body.subjects).toHaveLength(0);
    expect((await user.get(`${base}?archived=true`)).body.subjects).toHaveLength(1);

    await user.post(base, { name: 'Computer Networks' });
    expect((await user.patch(`${base}/${id}`, { archived: false })).body.error).toBe('name_taken');
    expect((await user.patch(`${base}/${id}`, {})).body.message).toBe('Send at least one field to change');
  });

  it('can be deleted while unused, and must be archived once the timetable uses them', async () => {
    const { user, timetable, base } = await setUp();
    const unused = (await user.post(base, { name: 'Unused' })).body.subject;
    expect((await user.delete(`${base}/${unused.id}`)).status).toBe(204);
    expect((await user.delete(`${base}/${unused.id}`)).status).toBe(404);

    const used = (await user.post(base, { name: 'DWDM' })).body.subject;
    const version = await pool.query<{ id: number }>("INSERT INTO grid_versions (timetable_id, effective_from) VALUES ($1, '2026-07-20') RETURNING id", [
      timetable.id,
    ]);
    await pool.query('INSERT INTO grid_slots (timetable_id, version_id, subject_id, weekday, start_minute, end_minute) VALUES ($1, $2, $3, 1, 720, 770)', [
      timetable.id,
      version.rows[0]!.id,
      used.id,
    ]);

    const refused = await user.delete(`${base}/${used.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('subject_in_use');
    expect((await user.patch(`${base}/${used.id}`, { archived: true })).status).toBe(200);
  });

  it('are private, and stay inside their own timetable', async () => {
    const { user: owner, timetable, base } = await setUp();
    const subject = (await owner.post(base, { name: 'DWDM' })).body.subject;
    const intruder = await newUser('intruder');

    for (const res of [
      await intruder.get(base),
      await intruder.post(base, { name: 'Injected' }),
      await intruder.patch(`${base}/${subject.id}`, { name: 'Mine' }),
      await intruder.delete(`${base}/${subject.id}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Timetable not found');
    }

    const second = (await owner.post('/timetables', { name: 'Second', startsOn: '2026-07-20' })).body.timetable;
    const wrongHome = await owner.patch(`/timetables/${second.id}/subjects/${subject.id}`, { name: 'Moved' });
    expect(wrongHome.status).toBe(404);
    expect(wrongHome.body.message).toBe('Subject not found');
    expect((await owner.delete(`/timetables/${second.id}/subjects/${subject.id}`)).status).toBe(404);

    const after = (await owner.get(base)).body.subjects;
    expect(after.map((s: { name: string }) => s.name)).toEqual(['DWDM']);
    expect(timetable.id).not.toBe(second.id);
  });

  it(`are limited to ${MAX_SUBJECTS} per timetable, even when added all at once`, async () => {
    const { user, base } = await setUp();
    const results = await Promise.all(Array.from({ length: MAX_SUBJECTS + 4 }, (_, i) => user.post(base, { name: `S${i}` })));
    expect(results.filter((res) => res.status === 201)).toHaveLength(MAX_SUBJECTS);
    expect(results.filter((res) => res.status === 409).every((res) => res.body.error === 'too_many_subjects')).toBe(true);
  });
});
