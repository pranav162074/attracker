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

type User = Awaited<ReturnType<typeof newUser>>;

const college = async (user: User) => {
  const timetable = (await user.post('/timetables', { name: 'College – Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75, condonationPercent: 65 }))
    .body.timetable;
  return { timetable, base: `/timetables/${timetable.id}` };
};

const fillIn = async (user: User, base: string, effectiveFrom = '2026-07-20') => {
  const ids = {} as Record<SubjectKey, number>;
  for (const subject of SUBJECTS) ids[subject.key] = (await user.post(`${base}/subjects`, { name: subject.name, kind: subject.kind })).body.subject.id;
  const slots = GRID.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] }));
  await user.put(`${base}/grid`, { effectiveFrom, slots });
  return ids;
};

const steps = (body: { steps: Array<{ key: string; done: boolean }> }) => Object.fromEntries(body.steps.map((step) => [step.key, step.done]));

describe.skipIf(skipWithoutDatabase)('setting up and starting to track', () => {
  it('starts every new timetable in setup', async () => {
    const user = await newUser();
    const { timetable, base } = await college(user);
    expect(timetable).toMatchObject({ status: 'setup', trackingStartedAt: null });

    const setup = await user.get(`${base}/setup`);
    expect(setup.status).toBe(200);
    expect(setup.body).toMatchObject({ status: 'setup', ready: false });
    expect(steps(setup.body)).toEqual({ dates: true, subjects: false, grid: false, holidays: false });
    expect(setup.body.steps[0].message).toBe('Runs from 2026-07-20 to 2026-11-14');
  });

  it('refuses to start until the essentials are filled in, saying what is missing', async () => {
    const user = await newUser();
    const { base } = await college(user);
    const refused = await user.post(`${base}/start`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('not_ready');
    expect(refused.body.message).toBe('Add at least one subject that counts for attendance. Fill in the weekly timetable');
    expect(refused.body.details).toHaveLength(4);
    expect((await user.get(base)).body.timetable.status).toBe('setup');
  });

  it('does not count subjects or classes that do not count for attendance', async () => {
    const user = await newUser();
    const { base } = await college(user);
    const library = (await user.post(`${base}/subjects`, { name: 'Library', kind: 'other' })).body.subject;
    await user.put(`${base}/grid`, { effectiveFrom: '2026-07-20', slots: [{ weekday: 2, start: '14:30', end: '15:20', subjectId: library.id }] });

    const setup = (await user.get(`${base}/setup`)).body;
    expect(steps(setup)).toMatchObject({ subjects: false, grid: false });

    const dwdm = (await user.post(`${base}/subjects`, { name: 'DWDM' })).body.subject;
    const again = (await user.get(`${base}/setup`)).body;
    expect(again.steps.find((step: { key: string }) => step.key === 'grid').message).toBe('The weekly timetable has no classes that count for attendance');
    expect(dwdm.countsAttendance).toBe(true);
  });

  it('needs the weekly timetable to cover the first day of the semester', async () => {
    const user = await newUser();
    const { base } = await college(user);
    await fillIn(user, base, '2026-08-03');
    const setup = (await user.get(`${base}/setup`)).body;
    expect(setup.ready).toBe(false);
    expect(setup.steps.find((step: { key: string }) => step.key === 'grid').message).toBe(
      'The weekly timetable starts on 2026-08-03, but the semester starts on 2026-07-20'
    );
  });

  it('starts tracking once dates, subjects and the timetable are in, with holidays counted when given', async () => {
    const user = await newUser();
    const { base } = await college(user);
    await fillIn(user, base);
    await user.post(`${base}/calendar/bulk`, {
      days: [
        { kind: 'holiday', startsOn: '2026-08-15', label: 'Independence Day' },
        { kind: 'holiday', startsOn: '2026-09-07', endsOn: '2026-09-12', label: 'Mid exams' },
      ],
    });

    const setup = (await user.get(`${base}/setup`)).body;
    expect(setup.ready).toBe(true);
    expect(setup.steps.map((step: { message: string }) => step.message)).toEqual([
      'Runs from 2026-07-20 to 2026-11-14',
      '9 subjects counted for attendance',
      '24 classes a week',
      '2 holidays and special days added',
    ]);

    const started = await user.post(`${base}/start`);
    expect(started.status).toBe(200);
    expect(started.body.timetable).toMatchObject({ status: 'tracking', trackingStartedAt: expect.any(String) });
    expect((await user.get('/timetables')).body.timetables[0].status).toBe('tracking');
    expect((await user.get(`${base}/setup`)).body.status).toBe('tracking');

    const again = await user.post(`${base}/start`);
    expect(again.status).toBe(200);
    expect(again.body.timetable.trackingStartedAt).toBe(started.body.timetable.trackingStartedAt);
  });

  it('lets holidays be skipped, for things like a dance class with no end date', async () => {
    const user = await newUser();
    const dance = (await user.post('/timetables', { name: 'Dance', startsOn: '2026-08-01' })).body.timetable;
    const base = `/timetables/${dance.id}`;
    const subject = (await user.post(`${base}/subjects`, { name: 'Bharatanatyam', countPerSession: true })).body.subject;
    await user.put(`${base}/grid`, { effectiveFrom: '2026-08-01', slots: [{ weekday: 6, start: '17:00', end: '18:30', subjectId: subject.id }] });

    const setup = (await user.get(`${base}/setup`)).body;
    expect(setup.ready).toBe(true);
    expect(setup.steps[0].message).toBe('Starts on 2026-08-01, no end date');
    expect((await user.post(`${base}/start`)).status).toBe(200);
  });

  it('stays fully editable after tracking starts', async () => {
    const user = await newUser();
    const { base } = await college(user);
    const ids = await fillIn(user, base);
    await user.post(`${base}/start`);

    expect((await user.patch(base, { name: 'Sem V' })).status).toBe(200);
    expect((await user.post(`${base}/calendar`, { kind: 'holiday', startsOn: '2026-10-02', label: 'Gandhi Jayanthi' })).status).toBe(201);
    expect((await user.post(`${base}/subjects`, { name: 'Seminar' })).status).toBe(201);
    const slots = GRID.map(({ subject, ...slot }) => ({ ...slot, subjectId: ids[subject] }));
    expect((await user.put(`${base}/grid`, { effectiveFrom: '2026-09-15', slots })).status).toBe(201);
    expect((await user.get(base)).body.timetable.status).toBe('tracking');
  });

  it('moves the first weekly timetable along when the semester start moves earlier', async () => {
    const user = await newUser();
    const { base } = await college(user);
    await fillIn(user, base);
    expect((await user.patch(base, { startsOn: '2026-07-13' })).status).toBe(200);

    const versions = (await user.get(`${base}/grid/versions`)).body.versions;
    expect(versions[0].effectiveFrom).toBe('2026-07-13');
    expect((await user.get(`${base}/setup`)).body.ready).toBe(true);
  });

  it('is private', async () => {
    const owner = await newUser('owner');
    const { base } = await college(owner);
    await fillIn(owner, base);
    const intruder = await newUser('intruder');
    expect((await intruder.get(`${base}/setup`)).status).toBe(404);
    expect((await intruder.post(`${base}/start`)).status).toBe(404);
    expect((await owner.get(base)).body.timetable.status).toBe('setup');
  });
});
