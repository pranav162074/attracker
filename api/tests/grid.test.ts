import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../src/db/pool.ts';
import { todayIn } from '../src/grid/time.ts';
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

type Slot = { id: number; weekday: number; start: string; end: string; periods: number; subjectId: number };

const setUp = async () => {
  const user = await newUser();
  const timetable = (await user.post('/timetables', { name: 'College – Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75, condonationPercent: 65 }))
    .body.timetable;
  const ids = {} as Record<SubjectKey, number>;
  for (const subject of SUBJECTS) {
    ids[subject.key] = (await user.post(`/timetables/${timetable.id}/subjects`, { name: subject.name, kind: subject.kind })).body.subject.id;
  }
  const grid = `/timetables/${timetable.id}/grid`;
  const slots = (entries = GRID) => entries.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] }));
  const find = (list: Slot[], weekday: number, start: string) => list.find((slot) => slot.weekday === weekday && slot.start === start)!;
  return { user, timetable, ids, grid, slots, find };
};

const mark = (timetableId: number, slotId: number, date: string) =>
  pool.query("INSERT INTO class_marks (timetable_id, slot_id, on_date, attendance) VALUES ($1, $2, $3, 'absent')", [timetableId, slotId, date]);

describe.skipIf(skipWithoutDatabase)('the weekly grid', () => {
  it('holds the Sem V timetable, labs and non-counted periods included', async () => {
    const { user, grid, slots, ids, find } = await setUp();
    const saved = await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() });

    expect(saved.status).toBe(201);
    expect(saved.body.version).toMatchObject({ effectiveFrom: '2026-07-20', effectiveUntil: null, slotCount: 29 });
    expect(saved.body.summary).toMatchObject({ created: true, added: 29 });

    const monday = await user.get(`${grid}?on=2026-08-03`);
    expect(monday.status).toBe(200);
    expect(monday.body.slots).toHaveLength(29);
    expect(find(monday.body.slots, 1, '08:40')).toMatchObject({ end: '11:10', periods: 3, subjectId: ids.OOADL });
    expect(find(monday.body.slots, 3, '12:00')).toMatchObject({ end: '14:30', periods: 3, subjectId: ids.PCSS });
    expect(monday.body.slots.map((slot: Slot) => `${slot.weekday} ${slot.start}`).slice(0, 3)).toEqual(['1 08:40', '1 12:00', '1 12:50']);
  });

  it('keeps old weeks on the old schedule when a new one starts mid-semester', async () => {
    const { user, grid, slots, ids, find } = await setUp();
    await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() });
    const changed = slots().map((slot) => (slot.weekday === 1 && slot.start === '12:00' ? { ...slot, subjectId: ids.ADSA } : slot));
    const later = await user.put(grid, { effectiveFrom: '2026-09-15', slots: changed });
    expect(later.status).toBe(201);

    const versions = (await user.get(`${grid}/versions`)).body.versions;
    expect(versions.map((v: { effectiveFrom: string; effectiveUntil: string | null }) => [v.effectiveFrom, v.effectiveUntil])).toEqual([
      ['2026-07-20', '2026-09-14'],
      ['2026-09-15', null],
    ]);
    expect(find((await user.get(`${grid}?on=2026-09-14`)).body.slots, 1, '12:00').subjectId).toBe(ids.DWDM);
    expect(find((await user.get(`${grid}?on=2026-09-15`)).body.slots, 1, '12:00').subjectId).toBe(ids.ADSA);

    const today = await user.get(grid);
    const expected = todayIn('Asia/Kolkata') >= '2026-09-15' ? '2026-09-15' : '2026-07-20';
    expect(today.body.version.effectiveFrom).toBe(expected);
  });

  it('keeps every class, and its marks, when the same version is saved again', async () => {
    const { user, timetable, grid, slots, find } = await setUp();
    const first = (await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() })).body;
    await mark(timetable.id, find(first.slots, 1, '12:00').id, '2026-08-03');

    const again = await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() });
    expect(again.status).toBe(200);
    expect(again.body.summary).toMatchObject({ created: false, kept: 29, changed: 0, added: 0, removed: 0 });
    expect(again.body.slots.map((slot: Slot) => slot.id).sort()).toEqual(first.slots.map((slot: Slot) => slot.id).sort());
  });

  it('keeps marks attached when a class gets a different subject or a corrected time', async () => {
    const { user, timetable, grid, slots, ids, find } = await setUp();
    const first = (await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() })).body;
    const cn = find(first.slots, 1, '13:40');
    const ooad = find(first.slots, 4, '12:50');
    await mark(timetable.id, cn.id, '2026-08-03');
    await mark(timetable.id, ooad.id, '2026-08-06');

    const fixed = slots().map((slot) => {
      if (slot.weekday === 1 && slot.start === '13:40') return { ...slot, subjectId: ids.DWDM };
      if (slot.weekday === 4 && slot.start === '12:50') return { ...slot, start: '12:55', end: '13:40' };
      return slot;
    });
    const res = await user.put(grid, { effectiveFrom: '2026-07-20', slots: fixed });
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ kept: 27, changed: 2, added: 0, removed: 0 });
    expect(find(res.body.slots, 1, '13:40')).toMatchObject({ id: cn.id, subjectId: ids.DWDM });
    expect(find(res.body.slots, 4, '12:55')).toMatchObject({ id: ooad.id, end: '13:40' });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM class_marks WHERE timetable_id = $1', [timetable.id]);
    expect(rows[0].n).toBe(2);
  });

  it('can swap two classes in one save, keeping each time slot and its marks in place', async () => {
    const { user, grid, slots, ids, find } = await setUp();
    const first = (await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() })).body;
    const swapped = slots().map((slot) => {
      if (slot.weekday === 1 && slot.start === '12:00') return { ...slot, start: '12:50', end: '13:40' };
      if (slot.weekday === 1 && slot.start === '12:50') return { ...slot, start: '12:00', end: '12:50' };
      return slot;
    });
    const res = await user.put(grid, { effectiveFrom: '2026-07-20', slots: swapped });
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ kept: 27, changed: 2 });
    expect(find(res.body.slots, 1, '12:00')).toMatchObject({ subjectId: ids.OOAD, id: find(first.slots, 1, '12:00').id });
    expect(find(res.body.slots, 1, '12:50')).toMatchObject({ subjectId: ids.DWDM, id: find(first.slots, 1, '12:50').id });
  });

  it('can shift a whole afternoon later, each class keeping its marks', async () => {
    const { user, timetable, grid, slots, find } = await setUp();
    const first = (await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() })).body;
    const before = ['12:00', '12:50', '13:40', '14:30'].map((start) => find(first.slots, 1, start));
    await mark(timetable.id, before[0]!.id, '2026-08-03');
    const shift = (clock: string) => {
      const [h, m] = clock.split(':').map(Number);
      const total = h! * 60 + m! + 10;
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };
    const shifted = slots().map((slot) => (slot.weekday === 1 && slot.start >= '12:00' ? { ...slot, start: shift(slot.start), end: shift(slot.end) } : slot));

    const res = await user.put(grid, { effectiveFrom: '2026-07-20', slots: shifted });
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ changed: 4, removed: 0, added: 0 });
    expect(['12:10', '13:00', '13:50', '14:40'].map((start) => find(res.body.slots, 1, start).id)).toEqual(before.map((slot) => slot.id));
  });

  it('refuses to silently drop a class that has marks, and drops it when told to', async () => {
    const { user, timetable, grid, slots, find } = await setUp();
    const first = (await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() })).body;
    await mark(timetable.id, find(first.slots, 2, '12:00').id, '2026-08-04');
    await mark(timetable.id, find(first.slots, 2, '12:00').id, '2026-08-11');
    const without = slots().filter((slot) => !(slot.weekday === 2 && slot.start === '12:00'));

    const refused = await user.put(grid, { effectiveFrom: '2026-07-20', slots: without });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('marks_would_be_lost');
    expect(refused.body.message).toMatch(/a class with 2 attendance marks/);
    expect(refused.body.details).toEqual([{ slotId: expect.any(Number), class: 'Tuesday 12:00–12:50', marks: 2 }]);
    expect((await user.get(`${grid}?on=2026-08-04`)).body.slots).toHaveLength(29);

    const confirmed = await user.put(grid, { effectiveFrom: '2026-07-20', slots: without, discardMarks: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.summary).toMatchObject({ removed: 1, discardedMarks: 2, kept: 28 });

    const unmarked = slots().filter((slot) => !(slot.weekday === 5 && slot.start === '14:30') && !(slot.weekday === 2 && slot.start === '12:00'));
    expect((await user.put(grid, { effectiveFrom: '2026-07-20', slots: unmarked })).status).toBe(200);
  });

  it('explains what is wrong with a grid', async () => {
    const { user, grid, slots, ids } = await setUp();
    const other = (await user.post('/timetables', { name: 'Dance', startsOn: '2026-08-01' })).body.timetable;
    const foreign = (await user.post(`/timetables/${other.id}/subjects`, { name: 'Bharatanatyam' })).body.subject.id;
    await user.patch(`${grid.replace('/grid', '')}/subjects/${ids.SPORTS}`, { archived: true });

    const cases: Array<[object, string]> = [
      [{ effectiveFrom: '2026-07-20', slots: [...slots(), { weekday: 1, start: '12:30', end: '13:00', subjectId: ids.CN }] }, 'Two classes overlap on Monday: 12:00–12:50 and 12:30–13:00'],
      [{ effectiveFrom: '2026-07-20', slots: [{ weekday: 1, start: '10:00', end: '09:00', subjectId: ids.CN }] }, 'end must be after start'],
      [{ effectiveFrom: '2026-07-20', slots: [{ weekday: 1, start: '8:40', end: '09:30', subjectId: ids.CN }] }, 'start must be a time like 08:40'],
      [{ effectiveFrom: '2026-07-20', slots: [{ weekday: 8, start: '08:40', end: '09:30', subjectId: ids.CN }] }, 'weekday must be 1 (Monday) to 7 (Sunday)'],
      [{ effectiveFrom: '2026-07-20', slots: [{ weekday: 1, start: '08:40', end: '09:30', periods: 13, subjectId: ids.CN }] }, 'periods must be a whole number from 1 to 12'],
      [{ effectiveFrom: '2026-07-20', slots: [{ weekday: 1, start: '08:40', end: '09:30', subjectId: foreign }] }, `Subject ${foreign} is not part of this timetable`],
      [{ effectiveFrom: '2026-07-20', slots: slots() }, 'Sports is archived. Unarchive it to use it in the grid.'],
      [{ effectiveFrom: '2026-07-19', slots: [] }, 'effectiveFrom must be within the timetable’s dates'],
      [{ effectiveFrom: '2026-11-15', slots: [] }, 'effectiveFrom must be within the timetable’s dates'],
      [{ slots: [] }, 'effectiveFrom must be a date like 2026-07-20'],
    ];
    for (const [body, message] of cases) {
      const res = await user.put(grid, body);
      expect(res.status, message).toBe(400);
      expect(res.body.message).toBe(message);
    }
    expect((await user.get(`${grid}?on=yesterday`)).status).toBe(400);
  });

  it('removes a whole version, refusing while it holds marks unless told to', async () => {
    const { user, timetable, grid, slots, find } = await setUp();
    await user.put(grid, { effectiveFrom: '2026-07-20', slots: slots() });
    const later = (await user.put(grid, { effectiveFrom: '2026-09-15', slots: slots() })).body;
    await mark(timetable.id, find(later.slots, 3, '08:40').id, '2026-09-16');

    expect((await user.delete(`${grid}/versions/${later.version.id}`)).status).toBe(409);
    expect((await user.delete(`${grid}/versions/${later.version.id}?discardMarks=true`)).status).toBe(204);
    expect((await user.get(`${grid}/versions`)).body.versions).toHaveLength(1);
    expect((await user.get(`${grid}?on=2026-09-20`)).body.version.effectiveFrom).toBe('2026-07-20');
    expect((await user.delete(`${grid}/versions/${later.version.id}`)).status).toBe(404);
  });

  it('shows no classes before the first version starts', async () => {
    const { user, grid, slots } = await setUp();
    await user.put(grid, { effectiveFrom: '2026-08-01', slots: slots() });
    const before = await user.get(`${grid}?on=2026-07-25`);
    expect(before.body).toEqual({ on: '2026-07-25', version: null, slots: [] });
  });

  it('is private', async () => {
    const { user: owner, grid, slots } = await setUp();
    const saved = (await owner.put(grid, { effectiveFrom: '2026-07-20', slots: slots() })).body;
    const intruder = await newUser('intruder');
    for (const res of [
      await intruder.get(grid),
      await intruder.get(`${grid}/versions`),
      await intruder.put(grid, { effectiveFrom: '2026-07-20', slots: [] }),
      await intruder.delete(`${grid}/versions/${saved.version.id}?discardMarks=true`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect((await owner.get(`${grid}?on=2026-08-03`)).body.slots).toHaveLength(29);
  });
});
