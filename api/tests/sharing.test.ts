import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../src/db/pool.ts';
import { formatShareCode, newShareCode, normaliseShareCode } from '../src/sharing/codes.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';
import { createdEmails, newUser, testIpPrefix } from './helpers.ts';
import { GRID, SUBJECTS } from './fixtures/semV.ts';
import type { SubjectKey } from './fixtures/semV.ts';

afterAll(async () => {
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
    await pool.query("DELETE FROM rate_limit_windows WHERE key LIKE $1 OR bucket LIKE 'shared:%'", [`${testIpPrefix}%`]);
  }
  await closePool();
});

type User = Awaited<ReturnType<typeof newUser>>;

const tracked = async (user: User) => {
  const timetable = (await user.post('/timetables', { name: 'Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75, condonationPercent: 65 })).body.timetable;
  const base = `/timetables/${timetable.id}`;
  const ids = {} as Record<SubjectKey, number>;
  for (const subject of SUBJECTS) ids[subject.key] = (await user.post(`${base}/subjects`, { name: subject.name, kind: subject.kind })).body.subject.id;
  const library = (await user.post(`${base}/subjects`, { name: 'Mentoring', kind: 'other' })).body.subject.id;
  const slots = GRID.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] }));
  await user.put(`${base}/grid`, { effectiveFrom: '2026-07-20', slots: [...slots, { weekday: 7, start: '09:00', end: '10:00', subjectId: library }] });
  await user.post(`${base}/calendar/bulk`, {
    days: [
      { kind: 'holiday', startsOn: '2026-08-15', label: 'Independence Day' },
      { kind: 'follows_weekday', startsOn: '2026-09-26', followsWeekday: 1, label: 'Saturday classes' },
    ],
  });
  await user.post(`${base}/start`);
  return { timetable, base, ids, slotCount: slots.length + 1 };
};

describe('share codes', () => {
  it('are 8 easy-to-read letters and numbers', () => {
    const codes = Array.from({ length: 300 }, newShareCode);
    expect(codes.every((code) => /^[A-HJ-NP-Z2-9]{8}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(300);
    expect(formatShareCode('7K3PQ9M2')).toBe('7K3P-Q9M2');
  });

  it('are read however they are typed', () => {
    expect(normaliseShareCode('7k3p-q9m2')).toBe('7K3PQ9M2');
    expect(normaliseShareCode(' 7K3P Q9M2 ')).toBe('7K3PQ9M2');
    expect(normaliseShareCode('7K3P-Q9M')).toBeNull();
    expect(normaliseShareCode('7K3P-Q9M0')).toBeNull();
    expect(normaliseShareCode('7K3P-Q9MI')).toBeNull();
  });
});

describe.skipIf(skipWithoutDatabase)('sharing a timetable with a classmate', () => {
  it('gives one lasting code per timetable, only to its owner', async () => {
    const owner = await newUser();
    const { base } = await tracked(owner);
    expect((await owner.get(`${base}/share`)).body).toEqual({ code: null });
    const first = await owner.post(`${base}/share`);
    expect(first.status).toBe(200);
    expect(first.body.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect((await owner.post(`${base}/share`)).body.code).toBe(first.body.code);
    expect((await owner.get(`${base}/share`)).body.code).toBe(first.body.code);

    const stranger = await newUser('stranger');
    expect((await stranger.get(`${base}/share`)).status).toBe(404);
    expect((await stranger.post(`${base}/share`)).status).toBe(404);
  });

  it('shows a preview of what will be copied, with nothing personal', async () => {
    const owner = await newUser();
    const { base, slotCount } = await tracked(owner);
    const code = (await owner.post(`${base}/share`)).body.code as string;
    const friend = await newUser('friend');
    const preview = await friend.get(`/shared/${code.toLowerCase()}`);
    expect(preview.status).toBe(200);
    expect(preview.body.shared).toMatchObject({
      code,
      name: 'Sem V',
      startsOn: '2026-07-20',
      endsOn: '2026-11-14',
      requiredPercent: 75,
      condonationPercent: 65,
      classesPerWeek: slotCount,
      specialDays: 2,
    });
    expect(preview.body.shared.subjects).toHaveLength(SUBJECTS.length + 1);
    expect(preview.body.shared.subjects.at(-1)).toEqual({ name: 'Mentoring', kind: 'other', countsAttendance: false });
    expect(JSON.stringify(preview.body)).not.toMatch(/@|email|user/i);
  });

  it('copies dates, rules, subjects, the weekly timetable and holidays into a new timetable in setup', async () => {
    const owner = await newUser();
    const { base, timetable: original } = await tracked(owner);
    const ownerDay = (await owner.get(`${base}/days/2026-09-01`)).body.day;
    await owner.put(`${base}/days/2026-09-01/classes/${ownerDay.classes[0].slotId}`, { attendance: 'absent' });
    await owner.post(`${base}/checkpoints`, { asOf: '2026-08-31', overallBp: 7024 });
    const code = (await owner.post(`${base}/share`)).body.code as string;

    const friend = await newUser('friend');
    const copied = await friend.post(`/shared/${code}/copy`, {});
    expect(copied.status).toBe(201);
    const copy = copied.body.timetable;
    expect(copy.id).not.toBe(original.id);
    expect(copy).toMatchObject({ name: 'Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75, condonationPercent: 65, status: 'setup' });

    const mine = `/timetables/${copy.id}`;
    const [ownerSubjects, friendSubjects] = await Promise.all([owner.get(`${base}/subjects`), friend.get(`${mine}/subjects`)]);
    const shape = (rows: Array<Record<string, unknown>>) => rows.map(({ name, shortName, kind, countsAttendance, countPerSession, colour }) => ({ name, shortName, kind, countsAttendance, countPerSession, colour }));
    expect(shape(friendSubjects.body.subjects)).toEqual(shape(ownerSubjects.body.subjects));

    const [ownerGrid, friendGrid] = await Promise.all([owner.get(`${base}/grid?on=2026-08-03`), friend.get(`${mine}/grid?on=2026-08-03`)]);
    const names = new Map<number, string>(friendSubjects.body.subjects.map((s: { id: number; name: string }) => [s.id, s.name]));
    const ownerNames = new Map<number, string>(ownerSubjects.body.subjects.map((s: { id: number; name: string }) => [s.id, s.name]));
    const slots = (grid: { slots: Array<{ weekday: number; start: string; end: string; periods: number; subjectId: number }> }, map: Map<number, string>) =>
      grid.slots.map((slot) => `${slot.weekday} ${slot.start}-${slot.end} ×${slot.periods} ${map.get(slot.subjectId)}`).sort();
    expect(slots(friendGrid.body, names)).toEqual(slots(ownerGrid.body, ownerNames));
    expect(friendGrid.body.slots.length).toBeGreaterThan(20);
    expect(friendGrid.body.version.effectiveFrom).toBe('2026-07-20');

    const friendCalendar = (await friend.get(`${mine}/calendar`)).body.days.map((day: { kind: string; startsOn: string; label: string }) => `${day.kind} ${day.startsOn} ${day.label}`);
    expect(friendCalendar).toEqual(['holiday 2026-08-15 Independence Day', 'follows_weekday 2026-09-26 Saturday classes']);

    expect((await friend.get(`${mine}/checkpoints`)).body.checkpoints).toEqual([]);
    expect((await friend.post(`${mine}/start`)).status).toBe(200);
    const friendDay = (await friend.get(`${mine}/days/2026-09-01`)).body.day;
    expect(friendDay.classes.every((item: { status: string }) => item.status === 'attended')).toBe(true);
  });

  it('lets the copy change freely, and keeps it after the original is edited or deleted', async () => {
    const owner = await newUser();
    const { base, ids } = await tracked(owner);
    const code = (await owner.post(`${base}/share`)).body.code as string;
    const friend = await newUser('friend');
    const copy = (await friend.post(`/shared/${code}/copy`, { name: 'My Sem V' })).body.timetable;
    expect(copy.name).toBe('My Sem V');
    const mine = `/timetables/${copy.id}`;

    const elective = (await friend.get(`${mine}/subjects`)).body.subjects.find((s: { name: string }) => s.name === SUBJECTS[0]!.name);
    expect((await friend.patch(`${mine}/subjects/${elective.id}`, { name: 'Open Elective: Psychology' })).status).toBe(200);
    expect((await owner.get(`${base}/subjects`)).body.subjects.find((s: { id: number }) => s.id === ids[SUBJECTS[0]!.key]).name).toBe(SUBJECTS[0]!.name);

    await owner.patch(`${base}/subjects/${ids[SUBJECTS[1]!.key]}`, { name: 'Renamed by owner' });
    expect((await friend.get(`${mine}/subjects`)).body.subjects.some((s: { name: string }) => s.name === 'Renamed by owner')).toBe(false);

    expect((await owner.delete(base)).status).toBe(204);
    expect((await friend.get(mine)).status).toBe(200);
    expect((await friend.get(`${mine}/subjects`)).body.subjects).toHaveLength(SUBJECTS.length + 1);
    expect((await friend.get(`/shared/${code}`)).status).toBe(404);
  });

  it('asks for a new name when the classmate already has one with the same name', async () => {
    const owner = await newUser();
    const { base } = await tracked(owner);
    const code = (await owner.post(`${base}/share`)).body.code as string;
    const friend = await newUser('friend');
    await friend.post('/timetables', { name: 'Sem V', startsOn: '2026-07-20' });
    const clash = await friend.post(`/shared/${code}/copy`, {});
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('name_taken');
    expect((await friend.post(`/shared/${code}/copy`, { name: 'Sem V (copy)' })).status).toBe(201);
  });

  it('copies the weekly timetable in use today when it has changed during the semester', async () => {
    const owner = await newUser();
    const { base, ids } = await tracked(owner);
    const today = new Date().toISOString().slice(0, 10);
    if (today < '2026-07-21' || today > '2026-11-14') return;
    await owner.put(`${base}/grid`, { effectiveFrom: today, slots: [{ weekday: 1, start: '08:00', end: '09:00', subjectId: ids[SUBJECTS[0]!.key] }], discardMarks: true });
    const code = (await owner.post(`${base}/share`)).body.code as string;
    const friend = await newUser('friend');
    const copy = (await friend.post(`/shared/${code}/copy`, {})).body.timetable;
    const grid = (await friend.get(`/timetables/${copy.id}/grid?on=2026-08-03`)).body;
    expect(grid.slots).toHaveLength(1);
    expect(grid.version.effectiveFrom).toBe('2026-07-20');
  });

  it('turns away unknown and badly typed codes, and needs a login', async () => {
    const friend = await newUser('friend');
    const unknown = await friend.get('/shared/2222-2222');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ error: 'unknown_code', message: 'No timetable has this code. Check it with the person who shared it.' });
    expect((await friend.post('/shared/2222-2222/copy', {})).status).toBe(404);
    const bad = await friend.get('/shared/hello');
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('A code is 8 letters and numbers, like 7K3P-Q9M2');
    const { default: request } = await import('supertest');
    const { app } = await import('../src/app.ts');
    expect((await request(app).get('/shared/2222-2222')).status).toBe(401);
  });
});
