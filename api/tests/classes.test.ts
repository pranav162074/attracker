import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { pool, closePool } from '../src/db/pool.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';
import { createdEmails, newUser, testIpPrefix } from './helpers.ts';
import { GRID, SUBJECTS } from './fixtures/semV.ts';
import type { SubjectKey } from './fixtures/semV.ts';

afterAll(async () => {
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1', [`${testIpPrefix}%`]);
  }
  await closePool();
});

type Listed = {
  timetableId: number;
  timetableName: string;
  date: string;
  slotId: number | null;
  subjectId: number;
  scheduledSubjectId: number;
  subjectName: string | null;
  start: string;
  end: string;
  counts: boolean;
  status: string;
  plannedAbsent: boolean;
};

const setUp = async (user: Awaited<ReturnType<typeof newUser>>, name: string, start = true) => {
  const timetable = (await user.post('/timetables', { name, startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75 })).body.timetable;
  const base = `/timetables/${timetable.id}`;
  const ids = {} as Record<SubjectKey, number>;
  for (const subject of SUBJECTS) ids[subject.key] = (await user.post(`${base}/subjects`, { name: subject.name, kind: subject.kind })).body.subject.id;
  await user.put(`${base}/grid`, { effectiveFrom: '2026-07-20', slots: GRID.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] })) });
  await user.post(`${base}/calendar/bulk`, { days: [{ kind: 'holiday', startsOn: '2026-08-21', label: 'Vara Lakshmi Vratham' }] });
  if (start) expect((await user.post(`${base}/start`)).status).toBe(200);
  return { timetable, base, ids };
};

describe.skipIf(skipWithoutDatabase)('classes between two dates', () => {
  it('lists every class of tracking semesters in order, with names and end times', async () => {
    const user = await newUser();
    const { timetable, ids } = await setUp(user, 'College');
    const res = await user.get('/classes?from=2026-08-03&to=2026-08-04');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const classes = res.body.classes as Listed[];
    expect(classes.map((item) => `${item.date} ${item.start}-${item.end}`)).toEqual([
      '2026-08-03 08:40-11:10',
      '2026-08-03 12:00-12:50',
      '2026-08-03 12:50-13:40',
      '2026-08-03 13:40-14:30',
      '2026-08-03 14:30-15:20',
      '2026-08-04 08:40-11:10',
      '2026-08-04 12:00-12:50',
      '2026-08-04 12:50-13:40',
      '2026-08-04 13:40-14:30',
      '2026-08-04 14:30-15:20',
    ]);
    expect(classes[1]).toMatchObject({
      timetableId: timetable.id,
      timetableName: 'College',
      subjectId: ids.DWDM,
      scheduledSubjectId: ids.DWDM,
      subjectName: 'Data Warehousing and Data Mining',
      counts: true,
      plannedAbsent: false,
    });
    expect(classes[1]!.slotId).toEqual(expect.any(Number));
    expect(classes[4]).toMatchObject({ subjectId: ids.COUN, counts: false });
  });

  it('skips holidays and shows marks already made', async () => {
    const user = await newUser();
    const { base } = await setUp(user, 'College');
    expect((await user.get('/classes?from=2026-08-21&to=2026-08-21')).body.classes).toEqual([]);
    const before = (await user.get('/classes?from=2026-08-03&to=2026-08-03')).body.classes as Listed[];
    const dwdm = before.find((item) => item.start === '12:00')!;
    expect((await user.put(`${base}/days/2026-08-03/classes/${dwdm.slotId}`, { attendance: 'cancelled' })).status).toBe(200);
    const after = (await user.get('/classes?from=2026-08-03&to=2026-08-03')).body.classes as Listed[];
    expect(after.find((item) => item.start === '12:00')!.status).toBe('cancelled');
  });

  it('leaves out semesters still being set up and other people’s semesters', async () => {
    const user = await newUser();
    await setUp(user, 'Tuition', false);
    expect((await user.get('/classes?from=2026-08-03&to=2026-08-03')).body.classes).toEqual([]);
    const tracked = await setUp(user, 'College');
    const someoneElse = await newUser();
    await setUp(someoneElse, 'Theirs');
    const mine = (await user.get('/classes?from=2026-08-03&to=2026-08-03')).body.classes as Listed[];
    expect(new Set(mine.map((item) => item.timetableId))).toEqual(new Set([tracked.timetable.id]));
  });

  it('checks the dates and needs a login', async () => {
    const user = await newUser();
    expect((await user.get('/classes?to=2026-08-03')).status).toBe(400);
    expect((await user.get('/classes?from=2026-08-03&to=2026-13-01')).status).toBe(400);
    const backwards = await user.get('/classes?from=2026-08-04&to=2026-08-03');
    expect(backwards.status).toBe(400);
    expect(backwards.body.message).toBe('to must be on or after from');
    const long = await user.get('/classes?from=2026-08-01&to=2026-09-01');
    expect(long.status).toBe(400);
    expect(long.body.message).toBe('Ask for at most 31 days at a time');
    expect((await user.get('/classes?from=2026-08-01&to=2026-08-31')).status).toBe(200);
    expect((await request(app).get('/classes?from=2026-08-03&to=2026-08-03')).status).toBe(401);
  });
});
