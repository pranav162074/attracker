import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { pool, closePool } from '../src/db/pool.ts';
import { nowIn } from '../src/attendance/load.ts';
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

const HOLIDAYS = [
  ['2026-08-15', 'Independence Day'],
  ['2026-08-21', 'Vara Lakshmi Vratham'],
  ['2026-08-25', 'Milad-Un-Nabi'],
  ['2026-09-04', 'Sri Krishnaashtami'],
  ['2026-09-14', 'Vinayaka Chavithi'],
  ['2026-10-02', 'Mahatma Gandhi Jayanthi'],
  ['2026-10-20', 'Vijaya Dasami'],
];

type User = Awaited<ReturnType<typeof newUser>>;
type SubjectRow = { subjectId: number; name: string; held: number; attended: number; percentText: string; remaining: number; unitsPerClass: number; archived: boolean; lines: Array<{ name: string; need: number; reachable: boolean; canMiss: number; met: boolean }> };

const semV = async (user: User) => {
  const timetable = (await user.post('/timetables', { name: 'College – Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75, condonationPercent: 65 }))
    .body.timetable;
  const base = `/timetables/${timetable.id}`;
  const ids = {} as Record<SubjectKey, number>;
  for (const subject of SUBJECTS) ids[subject.key] = (await user.post(`${base}/subjects`, { name: subject.name, kind: subject.kind })).body.subject.id;
  await user.put(`${base}/grid`, { effectiveFrom: '2026-07-20', slots: GRID.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] })) });
  await user.post(`${base}/calendar/bulk`, { days: HOLIDAYS.map(([startsOn, label]) => ({ kind: 'holiday', startsOn, label })) });
  await user.post(`${base}/start`);
  return { timetable, base, ids };
};

const OFFICIAL: Array<[SubjectKey, number, number]> = [
  ['DWDM', 32, 15], ['CN', 26, 18], ['OOAD', 32, 19], ['ADSA', 28, 15], ['OOADL', 30, 18],
  ['CNL', 30, 27], ['COI', 16, 10], ['PCSS', 21, 9], ['OE', 23, 11],
];

const addOfficialSheet = async (timetableId: number, ids: Record<SubjectKey, number>) => {
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO checkpoints (timetable_id, as_of, free_held, free_attended, source) VALUES ($1, '2026-09-30', 8, 8, 'sheet') RETURNING id",
    [timetableId]
  );
  for (const [key, held, attended] of OFFICIAL) {
    await pool.query('INSERT INTO checkpoint_subjects (timetable_id, checkpoint_id, subject_id, held, attended) VALUES ($1, $2, $3, $4, $5)', [
      timetableId,
      rows[0]!.id,
      ids[key],
      held,
      attended,
    ]);
  }
};

const find = (subjects: SubjectRow[], id: number) => subjects.find((row) => row.subjectId === id)!;
const line = (row: { lines: SubjectRow['lines'] }, name: string) => row.lines.find((l) => l.name === name)!;

describe.skipIf(skipWithoutDatabase)('the summary', () => {
  it('counts the timetable as scheduled, with labs by period and non-counted periods left out', async () => {
    const user = await newUser();
    const { base, ids } = await semV(user);
    const res = await user.get(`${base}/summary?asOf=2026-09-30`);
    expect(res.status).toBe(200);
    const { summary } = res.body;
    expect(summary).toMatchObject({ status: 'tracking', asOf: { date: '2026-09-30', time: '24:00' }, checkpoint: null });
    expect(summary.overall).toMatchObject({ held: 295, attended: 295, percentText: '100.00', zone: 'safe' });
    expect(summary.subjects).toHaveLength(9);
    expect(find(summary.subjects, ids.OOADL)).toMatchObject({ held: 30, unitsPerClass: 3, name: 'Object Oriented Analysis and Design Lab' });
    expect(find(summary.subjects, ids.CN)).toMatchObject({ held: 38, unitsPerClass: 1 });
    expect(summary.subjects.some((row: SubjectRow) => row.subjectId === ids.COUN)).toBe(false);
  });

  it('reproduces the official September sheet and its outlook through the API', async () => {
    const user = await newUser();
    const { timetable, base, ids } = await semV(user);
    await addOfficialSheet(timetable.id, ids);

    const { summary } = (await user.get(`${base}/summary?asOf=2026-09-30`)).body;
    expect(summary.checkpoint).toEqual({ asOf: '2026-09-30' });
    expect(summary.overall).toMatchObject({
      held: 246,
      attended: 150,
      missed: 96,
      percent: 60.97,
      percentText: '60.97',
      zone: 'below',
      freeHeld: 8,
      remaining: 181,
      bestText: '77.51',
    });
    expect(line(summary.overall, 'required')).toMatchObject({ need: 138, reachable: true, met: false });
    expect(line(summary.overall, 'condonation')).toMatchObject({ need: 29, reachable: true });
    expect(summary.overall.lines.map((l: { percent: number }) => l.percent)).toEqual([75, 65]);

    expect(OFFICIAL.map(([key]) => find(summary.subjects, ids[key]).percentText)).toEqual([
      '46.87', '69.23', '59.37', '53.57', '60.00', '90.00', '62.50', '42.85', '47.82',
    ]);
    expect(line(find(summary.subjects, ids.DWDM), 'required')).toMatchObject({ need: 36, reachable: false });
    expect(line(find(summary.subjects, ids.CNL), 'required')).toMatchObject({ met: true, canMiss: 6 });
  });

  it('adds the student’s own marks after the official sheet', async () => {
    const user = await newUser();
    const { timetable, base, ids } = await semV(user);
    await addOfficialSheet(timetable.id, ids);
    const monday = (await user.get(`${base}/days/2026-10-05`)).body.day.classes.find((c: { start: string }) => c.start === '12:00');
    await user.put(`${base}/days/2026-10-05/classes/${monday.slotId}`, { attendance: 'absent' });

    const { summary } = (await user.get(`${base}/summary?asOf=2026-10-07`)).body;
    expect(find(summary.subjects, ids.DWDM)).toMatchObject({ held: 35, attended: 17 });
  });

  it('keeps archived subjects that have history, and hides the rest', async () => {
    const user = await newUser();
    const { base, ids } = await semV(user);
    const unused = (await user.post(`${base}/subjects`, { name: 'Unused' })).body.subject;
    await user.patch(`${base}/subjects/${unused.id}`, { archived: true });
    await user.patch(`${base}/subjects/${ids.COI}`, { archived: true });

    const { summary } = (await user.get(`${base}/summary?asOf=2026-09-30`)).body;
    expect(summary.subjects.some((row: SubjectRow) => row.subjectId === unused.id)).toBe(false);
    expect(find(summary.subjects, ids.COI)).toMatchObject({ archived: true, held: 18 });
  });

  it('checks asOf, needs a login and is private', async () => {
    const user = await newUser();
    const { base } = await semV(user);
    expect((await user.get(`${base}/summary?asOf=30-09-2026`)).status).toBe(400);
    expect((await request(app).get(`${base}/summary`)).status).toBe(401);
    const intruder = await newUser('intruder');
    expect((await intruder.get(`${base}/summary`)).status).toBe(404);
  });
});

describe.skipIf(skipWithoutDatabase)('the home screen', () => {
  it('lists every active timetable with its headline number', async () => {
    const user = await newUser();
    const { timetable, ids } = await semV(user);
    await addOfficialSheet(timetable.id, ids);
    const dance = (await user.post('/timetables', { name: 'Dance', startsOn: '2026-08-01' })).body.timetable;
    const archived = (await user.post('/timetables', { name: 'Old', startsOn: '2026-01-01' })).body.timetable;
    await user.patch(`/timetables/${archived.id}`, { archived: true });

    const res = await user.get('/overview');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.timetables.map((t: { name: string }) => t.name)).toEqual(['College – Sem V', 'Dance']);
    expect(res.body.timetables[0]).toMatchObject({ timetableId: timetable.id, status: 'tracking', zone: expect.any(String) });
    expect(res.body.timetables[0].required).toMatchObject({ percent: 75 });
    expect(res.body.timetables[1]).toMatchObject({ timetableId: dance.id, status: 'setup', percent: null, zone: null, required: null });

    const other = await newUser('other');
    expect((await other.get('/overview')).body.timetables).toEqual([]);
    expect((await request(app).get('/overview')).status).toBe(401);
  });

  it('lists today’s classes from every timetable in time order', async () => {
    const user = await newUser();
    const today = nowIn('Asia/Kolkata').date;
    const make = async (name: string, start: string, end: string) => {
      const timetable = (await user.post('/timetables', { name, startsOn: today })).body.timetable;
      const base = `/timetables/${timetable.id}`;
      const subject = (await user.post(`${base}/subjects`, { name: `${name} subject` })).body.subject;
      const slots = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start, end, subjectId: subject.id }));
      await user.put(`${base}/grid`, { effectiveFrom: today, slots });
      await user.post(`${base}/start`);
      return timetable;
    };
    const dance = await make('Dance', '18:00', '19:00');
    const college = await make('College', '08:40', '09:30');

    const res = await user.get('/today');
    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { timetableName: string; start: string; subjectName: string }) => [c.timetableName, c.start, c.subjectName])).toEqual([
      ['College', '08:40', 'College subject'],
      ['Dance', '18:00', 'Dance subject'],
    ]);
    expect(res.body.classes[0]).toMatchObject({ timetableId: college.id, date: today, tracking: true, counts: true });
    expect(res.body.classes[1].timetableId).toBe(dance.id);
    expect((await request(app).get('/today')).status).toBe(401);
  });
});
