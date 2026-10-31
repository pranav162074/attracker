import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../src/db/pool.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';
import { createdEmails, newUser, testIpPrefix } from './helpers.ts';

const GVPCE = `Holidays
15.08.2026 (Saturday): Independence Day 14.09.2026 (Monday): Vinayaka Chavithi
21.08.2026 (Friday): Vara Lakshmi Vratham 02.10.2026 (Friday): Mahatma Gandhi Jayanthi
25.08.2026 (Tuesday): Milad-Un-Nabi 20.10.2026 (Tuesday): Vijaya Dasami
04.09.2026 (Friday): Sri Krishnaashtami`;

afterAll(async () => {
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1', [`${testIpPrefix}%`]);
  }
  await closePool();
});

const setUp = async () => {
  const user = await newUser();
  const timetable = (await user.post('/timetables', { name: 'College – Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14' })).body.timetable;
  return { user, timetable, base: `/timetables/${timetable.id}/calendar` };
};

describe.skipIf(skipWithoutDatabase)('the calendar', () => {
  it('holds holidays, breaks, half days and Saturdays that follow a weekday', async () => {
    const { user, base } = await setUp();
    const added = [
      await user.post(base, { kind: 'holiday', startsOn: '2026-08-15', label: 'Independence Day' }),
      await user.post(base, { kind: 'holiday', startsOn: '2026-09-07', endsOn: '2026-09-12', label: 'Mid exams' }),
      await user.post(base, { kind: 'follows_weekday', startsOn: '2026-08-22', followsWeekday: 1 }),
      await user.post(base, { kind: 'no_classes_after', startsOn: '2026-08-28', cutoff: '12:00', label: 'Half day' }),
      await user.post(base, { kind: 'no_classes_before', startsOn: '2026-08-31', cutoff: '12:00' }),
    ];
    expect(added.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
    expect(added[1]!.body.day).toEqual({
      id: expect.any(Number),
      kind: 'holiday',
      startsOn: '2026-09-07',
      endsOn: '2026-09-12',
      followsWeekday: null,
      cutoff: null,
      label: 'Mid exams',
    });
    expect(added[2]!.body.day).toMatchObject({ endsOn: '2026-08-22', followsWeekday: 1, label: null });
    expect(added[3]!.body.day).toMatchObject({ cutoff: '12:00' });

    const all = (await user.get(base)).body.days.map((d: { startsOn: string }) => d.startsOn);
    expect(all).toEqual(['2026-08-15', '2026-08-22', '2026-08-28', '2026-08-31', '2026-09-07']);
    const september = (await user.get(`${base}?from=2026-09-01&to=2026-09-08`)).body.days;
    expect(september.map((d: { label: string }) => d.label)).toEqual(['Mid exams']);
  });

  it('explains what is wrong with an entry', async () => {
    const { user, base } = await setUp();
    const cases: Array<[object, string]> = [
      [{ kind: 'festival', startsOn: '2026-08-15' }, 'kind must be holiday, follows_weekday, no_classes_before or no_classes_after'],
      [{ kind: 'holiday', startsOn: '15-08-2026' }, 'startsOn must be a date like 2026-07-20'],
      [{ kind: 'holiday', startsOn: '2026-08-15', endsOn: '2026-08-14' }, 'endsOn must be on or after startsOn'],
      [{ kind: 'follows_weekday', startsOn: '2026-08-22' }, 'Choose which weekday’s timetable this day follows'],
      [{ kind: 'follows_weekday', startsOn: '2026-08-22', endsOn: '2026-08-29', followsWeekday: 1 }, 'Only holidays can cover more than one day'],
      [{ kind: 'follows_weekday', startsOn: '2026-08-22', followsWeekday: 8 }, 'followsWeekday must be 1 (Monday) to 7 (Sunday)'],
      [{ kind: 'holiday', startsOn: '2026-08-15', followsWeekday: 1 }, 'followsWeekday only applies to follows_weekday'],
      [{ kind: 'no_classes_after', startsOn: '2026-08-28' }, 'Give the time classes stop or start, like 12:00'],
      [{ kind: 'no_classes_after', startsOn: '2026-08-28', cutoff: '12' }, 'cutoff must be a time like 12:00'],
      [{ kind: 'holiday', startsOn: '2026-08-15', cutoff: '12:00' }, 'cutoff only applies to half days'],
      [{ kind: 'holiday', startsOn: '2026-07-19' }, 'Days must be between 2026-07-20 and 2026-11-14'],
      [{ kind: 'holiday', startsOn: '2026-11-10', endsOn: '2026-11-20' }, 'Days must be between 2026-07-20 and 2026-11-14'],
    ];
    for (const [body, message] of cases) {
      const res = await user.post(base, body);
      expect(res.status, message).toBe(400);
      expect(res.body.message).toBe(message);
    }
  });

  it('allows one entry per day and says what is already there', async () => {
    const { user, base } = await setUp();
    await user.post(base, { kind: 'holiday', startsOn: '2026-08-15', label: 'Independence Day' });
    await user.post(base, { kind: 'holiday', startsOn: '2026-09-07', endsOn: '2026-09-12', label: 'Mid exams' });

    const same = await user.post(base, { kind: 'follows_weekday', startsOn: '2026-08-15', followsWeekday: 1 });
    expect(same.status).toBe(409);
    expect(same.body).toMatchObject({ error: 'day_taken', message: '2026-08-15 is already a holiday (Independence Day)' });

    const inRange = await user.post(base, { kind: 'no_classes_after', startsOn: '2026-09-10', cutoff: '12:00' });
    expect(inRange.body.message).toBe('2026-09-07 to 2026-09-12 is already a holiday (Mid exams)');
  });

  it('reads a pasted holiday list, saves it in one go, and spots the same list pasted twice', async () => {
    const { user, base } = await setUp();
    const preview = await user.post(`${base}/import`, { text: GVPCE });
    expect(preview.status).toBe(200);
    expect(preview.body.holidays).toHaveLength(7);
    expect(preview.body.holidays.every((h: { problems: string[] }) => h.problems.length === 0)).toBe(true);
    expect(preview.body.skipped).toHaveLength(1);
    expect((await user.get(base)).body.days).toHaveLength(0);

    const days = preview.body.holidays.map((h: { startsOn: string; endsOn: string; label: string }) => ({
      kind: 'holiday',
      startsOn: h.startsOn,
      endsOn: h.endsOn,
      label: h.label,
    }));
    const saved = await user.post(`${base}/bulk`, { days });
    expect(saved.status).toBe(201);
    expect(saved.body.days.map((d: { label: string }) => d.label)).toContain('Vijaya Dasami');

    const again = await user.post(`${base}/import`, { text: GVPCE });
    expect(again.body.holidays[0].problems).toEqual(['2026-08-15 is already a holiday (Independence Day)']);
    const duplicate = await user.post(`${base}/bulk`, { days });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe('7 of these days already have an entry');
    expect(duplicate.body.details).toHaveLength(7);
    expect((await user.get(base)).body.days).toHaveLength(7);
  });

  it('saves a list all-or-nothing', async () => {
    const { user, base } = await setUp();
    await user.post(base, { kind: 'holiday', startsOn: '2026-10-20', label: 'Vijaya Dasami' });
    const res = await user.post(`${base}/bulk`, {
      days: [
        { kind: 'holiday', startsOn: '2026-10-02' },
        { kind: 'holiday', startsOn: '2026-10-20' },
      ],
    });
    expect(res.status).toBe(409);
    expect((await user.get(base)).body.days).toHaveLength(1);

    const twice = await user.post(`${base}/bulk`, {
      days: [
        { kind: 'holiday', startsOn: '2026-08-01', endsOn: '2026-08-05' },
        { kind: 'holiday', startsOn: '2026-08-05' },
      ],
    });
    expect(twice.status).toBe(409);
    expect(twice.body.message).toBe('2026-08-05 appears twice in this list');
  });

  it('flags pasted dates outside the timetable instead of failing', async () => {
    const { user, base } = await setUp();
    const preview = await user.post(`${base}/import`, { text: '25.12.2026 Christmas\n02.10.2026 Gandhi Jayanthi' });
    expect(preview.body.holidays.map((h: { problems: string[] }) => h.problems)).toEqual([[], ['Outside the timetable’s dates']]);
  });

  it('can be edited, keeping the entry valid as a whole', async () => {
    const { user, base } = await setUp();
    const day = (await user.post(base, { kind: 'holiday', startsOn: '2026-08-21', label: 'Vara Lakshmi' })).body.day;
    await user.post(base, { kind: 'holiday', startsOn: '2026-08-25', label: 'Milad-Un-Nabi' });

    expect((await user.patch(`${base}/${day.id}`, { label: 'Vara Lakshmi Vratham' })).body.day.label).toBe('Vara Lakshmi Vratham');
    const moved = await user.patch(`${base}/${day.id}`, { startsOn: '2026-08-22' });
    expect(moved.body.day).toMatchObject({ startsOn: '2026-08-22', endsOn: '2026-08-22' });

    const needsWeekday = await user.patch(`${base}/${day.id}`, { kind: 'follows_weekday' });
    expect(needsWeekday.status).toBe(400);
    expect(needsWeekday.body.message).toBe('Choose which weekday’s timetable this day follows');
    const swapped = await user.patch(`${base}/${day.id}`, { kind: 'follows_weekday', followsWeekday: 5 });
    expect(swapped.body.day).toMatchObject({ kind: 'follows_weekday', followsWeekday: 5, cutoff: null });

    const clash = await user.patch(`${base}/${day.id}`, { startsOn: '2026-08-25' });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toBe('2026-08-25 is already a holiday (Milad-Un-Nabi)');

    expect((await user.patch(`${base}/${day.id}`, { label: null })).body.day.label).toBeNull();
  });

  it('removes entries', async () => {
    const { user, base } = await setUp();
    const day = (await user.post(base, { kind: 'holiday', startsOn: '2026-08-15' })).body.day;
    expect((await user.delete(`${base}/${day.id}`)).status).toBe(204);
    expect((await user.delete(`${base}/${day.id}`)).status).toBe(404);
    expect((await user.get(base)).body.days).toHaveLength(0);
  });

  it('is private, and entries stay inside their timetable', async () => {
    const { user: owner, base } = await setUp();
    const day = (await owner.post(base, { kind: 'holiday', startsOn: '2026-08-15' })).body.day;
    const intruder = await newUser('intruder');
    for (const res of [
      await intruder.get(base),
      await intruder.post(base, { kind: 'holiday', startsOn: '2026-08-16' }),
      await intruder.post(`${base}/bulk`, { days: [{ kind: 'holiday', startsOn: '2026-08-16' }] }),
      await intruder.post(`${base}/import`, { text: GVPCE }),
      await intruder.patch(`${base}/${day.id}`, { label: 'Mine' }),
      await intruder.delete(`${base}/${day.id}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Timetable not found');
    }

    const second = (await owner.post('/timetables', { name: 'Dance', startsOn: '2026-07-20' })).body.timetable;
    const elsewhere = `/timetables/${second.id}/calendar/${day.id}`;
    expect((await owner.patch(elsewhere, { label: 'Moved' })).body.message).toBe('Calendar entry not found');
    expect((await owner.delete(elsewhere)).body.message).toBe('Calendar entry not found');
    expect((await owner.get(base)).body.days[0].label).toBeNull();
  });
});
