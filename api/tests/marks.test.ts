import { describe, it, expect, afterAll } from 'vitest';
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

type Class = { key: string; slotId: number | null; extraId: number | null; subjectId: number; scheduledSubjectId: number; start: string; status: string; counts: boolean; units: number; plannedAbsent: boolean };

const setUp = async ({ start = true, startsOn = '2026-07-20', endsOn = '2026-11-14' } = {}) => {
  const user = await newUser();
  const timetable = (await user.post('/timetables', { name: 'College – Sem V', startsOn, endsOn, requiredPercent: 75, condonationPercent: 65 })).body.timetable;
  const base = `/timetables/${timetable.id}`;
  const ids = {} as Record<SubjectKey, number>;
  for (const subject of SUBJECTS) ids[subject.key] = (await user.post(`${base}/subjects`, { name: subject.name, kind: subject.kind })).body.subject.id;
  await user.put(`${base}/grid`, { effectiveFrom: startsOn, slots: GRID.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] })) });
  if (startsOn === '2026-07-20') {
    await user.post(`${base}/calendar/bulk`, {
      days: [
        { kind: 'holiday', startsOn: '2026-08-21', label: 'Vara Lakshmi Vratham' },
        { kind: 'follows_weekday', startsOn: '2026-08-22', followsWeekday: 1 },
      ],
    });
  }
  if (start) expect((await user.post(`${base}/start`)).status).toBe(200);
  const at = (classes: Class[], startTime: string) => classes.find((item) => item.start === startTime)!;
  return { user, timetable, base, ids, at };
};

describe.skipIf(skipWithoutDatabase)('a day', () => {
  it('lists its classes, all attended by default once they are over', async () => {
    const { user, base, ids, at } = await setUp();
    const res = await user.get(`${base}/days/2026-08-03`);
    expect(res.status).toBe(200);
    const { day } = res.body;
    expect(day).toMatchObject({ date: '2026-08-03', kind: 'normal', label: null, tracking: true });
    expect(day.classes.map((c: Class) => c.start)).toEqual(['08:40', '12:00', '12:50', '13:40', '14:30']);
    expect(at(day.classes, '08:40')).toMatchObject({ subjectId: ids.OOADL, units: 3, status: 'attended', counts: true });
    expect(at(day.classes, '14:30')).toMatchObject({ subjectId: ids.COUN, counts: false });
  });

  it('shows holidays and days that follow another weekday', async () => {
    const { user, base, ids } = await setUp();
    expect((await user.get(`${base}/days/2026-08-21`)).body.day).toMatchObject({ kind: 'holiday', label: 'Vara Lakshmi Vratham', classes: [] });
    const saturday = (await user.get(`${base}/days/2026-08-22`)).body.day;
    expect(saturday).toMatchObject({ kind: 'follows_weekday', followsWeekday: 1 });
    expect(saturday.classes[0].subjectId).toBe(ids.OOADL);
    expect((await user.get(`${base}/days/2026-07-19`)).body.day).toMatchObject({ kind: 'outside', classes: [] });
    expect((await user.get(`${base}/days/2026-13-01`)).status).toBe(400);
  });

  it('can be previewed during setup, but not marked until tracking starts', async () => {
    const { user, base, at } = await setUp({ start: false });
    const day = (await user.get(`${base}/days/2026-08-03`)).body.day;
    expect(day.tracking).toBe(false);
    const res = await user.put(`${base}/days/2026-08-03/classes/${at(day.classes, '12:00').slotId}`, { attendance: 'absent' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'not_tracking', message: 'Press Start Tracking before marking attendance' });
  });
});

describe.skipIf(skipWithoutDatabase)('marking a class', () => {
  it('records an absence, and setting it back to present removes the mark', async () => {
    const { user, timetable, base, at } = await setUp();
    const slotId = at((await user.get(`${base}/days/2026-08-03`)).body.day.classes, '12:00').slotId;
    const url = `${base}/days/2026-08-03/classes/${slotId}`;

    const absent = await user.put(url, { attendance: 'absent' });
    expect(absent.status).toBe(200);
    expect(at(absent.body.day.classes, '12:00').status).toBe('absent');

    const present = await user.put(url, { attendance: 'present' });
    expect(at(present.body.day.classes, '12:00').status).toBe('attended');
    const { rows } = await pool.query('SELECT 1 FROM class_marks WHERE timetable_id = $1', [timetable.id]);
    expect(rows).toHaveLength(0);
  });

  it('can be undone, and marks a whole lab in one go', async () => {
    const { user, base, at } = await setUp();
    const lab = at((await user.get(`${base}/days/2026-08-03`)).body.day.classes, '08:40');
    const marked = await user.put(`${base}/days/2026-08-03/classes/${lab.slotId}`, { attendance: 'absent' });
    expect(at(marked.body.day.classes, '08:40')).toMatchObject({ status: 'absent', units: 3 });
    const undone = await user.delete(`${base}/days/2026-08-03/classes/${lab.slotId}`);
    expect(at(undone.body.day.classes, '08:40').status).toBe('attended');
  });

  it('records cancelled classes and classes taken by another subject', async () => {
    const { user, base, ids, at } = await setUp();
    const slotId = at((await user.get(`${base}/days/2026-08-03`)).body.day.classes, '12:00').slotId;
    const url = `${base}/days/2026-08-03/classes/${slotId}`;

    expect(at((await user.put(url, { attendance: 'cancelled' })).body.day.classes, '12:00')).toMatchObject({ status: 'cancelled', cancelledBy: 'mark' });

    const swapped = at((await user.put(url, { attendance: 'present', substituteSubjectId: ids.ADSA })).body.day.classes, '12:00');
    expect(swapped).toMatchObject({ status: 'attended', subjectId: ids.ADSA, scheduledSubjectId: ids.DWDM });
    const missed = at((await user.put(url, { attendance: 'absent', substituteSubjectId: ids.ADSA })).body.day.classes, '12:00');
    expect(missed).toMatchObject({ status: 'absent', subjectId: ids.ADSA });

    const same = at((await user.put(url, { attendance: 'present', substituteSubjectId: ids.DWDM })).body.day.classes, '12:00');
    expect(same).toMatchObject({ status: 'attended', subjectId: ids.DWDM });
  });

  it('works on a Saturday that follows Monday', async () => {
    const { user, base, at } = await setUp();
    const lab = at((await user.get(`${base}/days/2026-08-22`)).body.day.classes, '08:40');
    const res = await user.put(`${base}/days/2026-08-22/classes/${lab.slotId}`, { attendance: 'absent' });
    expect(at(res.body.day.classes, '08:40').status).toBe('absent');
  });

  it('refuses classes that do not happen that day, and bad requests', async () => {
    const { user, base, ids, at } = await setUp();
    const monday = at((await user.get(`${base}/days/2026-08-03`)).body.day.classes, '12:00').slotId;
    for (const date of ['2026-08-04', '2026-08-21', '2026-07-13']) {
      const res = await user.put(`${base}/days/${date}/classes/${monday}`, { attendance: 'absent' });
      expect(res.status, date).toBe(409);
      expect(res.body.message).toBe('There is no such class on this day');
    }
    const url = `${base}/days/2026-08-03/classes/${monday}`;
    expect((await user.put(url, { attendance: 'cancelled', substituteSubjectId: ids.ADSA })).body.message).toBe('A cancelled class cannot have a substitute subject');
    expect((await user.put(url, { attendance: 'late' })).body.message).toBe('attendance must be present, absent or cancelled');

    await user.patch(`${base}/subjects/${ids.SPORTS}`, { archived: true });
    expect((await user.put(url, { attendance: 'present', substituteSubjectId: ids.SPORTS })).body.message).toBe('Sports is archived');
  });

  it('keeps a planned absence for a class that has not happened yet', async () => {
    const { user, base, at } = await setUp({ startsOn: '2030-07-15', endsOn: '2030-11-15' });
    const slotId = at((await user.get(`${base}/days/2030-07-15`)).body.day.classes, '12:00').slotId;
    const res = await user.put(`${base}/days/2030-07-15/classes/${slotId}`, { attendance: 'absent' });
    expect(at(res.body.day.classes, '12:00')).toMatchObject({ status: 'upcoming', plannedAbsent: true });
  });
});

describe.skipIf(skipWithoutDatabase)('extra classes', () => {
  it('can be added, changed and removed', async () => {
    const { user, base, ids } = await setUp();
    const added = await user.post(`${base}/days/2026-08-29/extra`, { subjectId: ids.ADSA, start: '10:00', end: '11:40', periods: 2 });
    expect(added.status).toBe(201);
    const extra = added.body.day.classes.find((c: Class) => c.extraId !== null);
    expect(extra).toMatchObject({ subjectId: ids.ADSA, start: '10:00', units: 2, status: 'attended', slotId: null });

    const changed = await user.patch(`${base}/extra/${extra.extraId}`, { attendance: 'absent', end: '10:50', periods: 1 });
    expect(changed.body.day.classes.find((c: Class) => c.extraId === extra.extraId)).toMatchObject({ status: 'absent', units: 1 });

    const removed = await user.delete(`${base}/extra/${extra.extraId}`);
    expect(removed.body.day.classes.filter((c: Class) => c.extraId !== null)).toHaveLength(0);
    expect((await user.delete(`${base}/extra/${extra.extraId}`)).status).toBe(404);
  });

  it('happen even on a holiday', async () => {
    const { user, base, ids } = await setUp();
    const res = await user.post(`${base}/days/2026-08-21/extra`, { subjectId: ids.CN, start: '09:00', end: '09:50' });
    expect(res.body.day).toMatchObject({ kind: 'holiday' });
    expect(res.body.day.classes).toHaveLength(1);
  });

  it('explain what is wrong', async () => {
    const { user, base, ids } = await setUp();
    const other = (await user.post('/timetables', { name: 'Dance', startsOn: '2026-07-20' })).body.timetable;
    const foreign = (await user.post(`/timetables/${other.id}/subjects`, { name: 'Bharatanatyam' })).body.subject.id;
    const cases: Array<[string, object, string]> = [
      ['2026-08-29', { subjectId: ids.CN, start: '10:00', end: '09:00' }, 'end must be after start'],
      ['2026-08-29', { subjectId: ids.CN, start: '9', end: '10:00' }, 'start must be a time like 08:40'],
      ['2026-11-20', { subjectId: ids.CN, start: '09:00', end: '10:00' }, 'Extra classes must be within the timetable’s dates'],
      ['2026-08-29', { subjectId: foreign, start: '09:00', end: '10:00' }, 'The subject is not part of this timetable'],
    ];
    for (const [date, body, message] of cases) {
      const res = await user.post(`${base}/days/${date}/extra`, body);
      expect(res.status, message).toBe(400);
      expect(res.body.message).toBe(message);
    }
  });
});

describe.skipIf(skipWithoutDatabase)('privacy', () => {
  it('keeps days, marks and extra classes to their owner and their timetable', async () => {
    const { user: owner, base, ids, at } = await setUp();
    const slotId = at((await owner.get(`${base}/days/2026-08-03`)).body.day.classes, '12:00').slotId;
    const extra = (await owner.post(`${base}/days/2026-08-29/extra`, { subjectId: ids.CN, start: '09:00', end: '09:50' })).body.day.classes[0];
    const intruder = await newUser('intruder');

    for (const res of [
      await intruder.get(`${base}/days/2026-08-03`),
      await intruder.put(`${base}/days/2026-08-03/classes/${slotId}`, { attendance: 'absent' }),
      await intruder.delete(`${base}/days/2026-08-03/classes/${slotId}`),
      await intruder.post(`${base}/days/2026-08-29/extra`, { subjectId: ids.CN, start: '09:00', end: '09:50' }),
      await intruder.patch(`${base}/extra/${extra.extraId}`, { attendance: 'absent' }),
      await intruder.delete(`${base}/extra/${extra.extraId}`),
    ]) {
      expect(res.status).toBe(404);
    }

    const second = (await owner.post('/timetables', { name: 'Second', startsOn: '2026-07-20', endsOn: '2026-11-14' })).body.timetable;
    const secondBase = `/timetables/${second.id}`;
    const subject = (await owner.post(`${secondBase}/subjects`, { name: 'Maths' })).body.subject;
    await owner.put(`${secondBase}/grid`, { effectiveFrom: '2026-07-20', slots: [{ weekday: 1, start: '12:00', end: '12:50', subjectId: subject.id }] });
    expect((await owner.post(`${secondBase}/start`)).status).toBe(200);

    const wrongTimetableMark = await owner.put(`${secondBase}/days/2026-08-03/classes/${slotId}`, { attendance: 'absent' });
    expect(wrongTimetableMark.status).toBe(409);
    expect(wrongTimetableMark.body.message).toBe('There is no such class on this day');
    const wrongTimetableExtra = await owner.patch(`${secondBase}/extra/${extra.extraId}`, { attendance: 'absent' });
    expect(wrongTimetableExtra.status).toBe(404);
    expect(wrongTimetableExtra.body.message).toBe('Extra class not found');
    expect((await owner.delete(`${secondBase}/extra/${extra.extraId}`)).status).toBe(404);
    expect(at((await owner.get(`${base}/days/2026-08-03`)).body.day.classes, '12:00').status).toBe('attended');
  });
});
