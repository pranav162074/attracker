import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { pool, closePool } from '../src/db/pool.ts';
import { MAX_ACTIVE_TIMETABLES } from '../src/timetables/repo.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';
import { createdEmails, newUser, testIpPrefix } from './helpers.ts';

const college = {
  name: 'College – Sem V',
  startsOn: '2026-07-20',
  endsOn: '2026-11-14',
  requiredPercent: 75,
  condonationPercent: 65,
};

afterAll(async () => {
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1', [`${testIpPrefix}%`]);
  }
  await closePool();
});

describe.skipIf(skipWithoutDatabase)('timetables', () => {
  it('are created with their settings and listed back', async () => {
    const user = await newUser();
    const created = await user.post('/timetables', college);

    expect(created.status).toBe(201);
    expect(created.body.timetable).toMatchObject({
      id: expect.any(Number),
      name: 'College – Sem V',
      startsOn: '2026-07-20',
      endsOn: '2026-11-14',
      timeZone: 'Asia/Kolkata',
      requiredPercent: 75,
      condonationPercent: 65,
      archived: false,
    });

    const dance = await user.post('/timetables', { name: '  Dance  ', startsOn: '2026-08-01' });
    expect(dance.body.timetable).toMatchObject({ name: 'Dance', endsOn: null, requiredPercent: null, condonationPercent: null });

    const list = await user.get('/timetables');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body.timetables.map((t: { name: string }) => t.name)).toEqual(['College – Sem V', 'Dance']);
  });

  it('keep percentages with decimals exactly', async () => {
    const user = await newUser();
    const res = await user.post('/timetables', { name: 'Strict', startsOn: '2026-07-20', requiredPercent: 72.5, condonationPercent: 62.25 });
    expect(res.body.timetable).toMatchObject({ requiredPercent: 72.5, condonationPercent: 62.25 });
  });

  it('explain what is wrong with bad settings', async () => {
    const user = await newUser();
    const cases: Array<[object, string]> = [
      [{ startsOn: '2026-07-20' }, 'Name is required'],
      [{ name: '   ', startsOn: '2026-07-20' }, 'Name is required'],
      [{ name: 'x'.repeat(61), startsOn: '2026-07-20' }, 'Name must be at most 60 characters'],
      [{ name: 'A', startsOn: '20-07-2026' }, 'Start date must be a date like 2026-07-20'],
      [{ name: 'A', startsOn: '2026-02-30' }, 'Start date is not a real date'],
      [{ name: 'A', startsOn: '2026-07-20', endsOn: '2026-07-19' }, 'End date must be on or after the start date'],
      [{ name: 'A', startsOn: '2026-07-20', requiredPercent: 0 }, 'Required percentage must be more than 0'],
      [{ name: 'A', startsOn: '2026-07-20', requiredPercent: 101 }, 'Required percentage must be at most 100'],
      [{ name: 'A', startsOn: '2026-07-20', requiredPercent: 75.555 }, 'Required percentage can have at most 2 decimal places'],
      [{ name: 'A', startsOn: '2026-07-20', requiredPercent: '75' }, 'Required percentage must be a number'],
      [{ name: 'A', startsOn: '2026-07-20', condonationPercent: 65 }, 'Set a required percentage before a condonation percentage'],
      [{ name: 'A', startsOn: '2026-07-20', requiredPercent: 75, condonationPercent: 75 }, 'Condonation percentage must be below the required percentage'],
      [{ name: 'A', startsOn: '2026-07-20', timeZone: 'Mars/Olympus' }, 'Time zone is not recognised'],
      [{ name: 'A', startsOn: '2026-07-20', userId: 1 }, 'Unrecognized key: "userId"'],
    ];
    for (const [body, message] of cases) {
      const res = await user.post('/timetables', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.message, JSON.stringify(body)).toBe(message);
    }
  });

  it('need unique names among active ones, ignoring case', async () => {
    const user = await newUser();
    await user.post('/timetables', college);
    const again = await user.post('/timetables', { ...college, name: 'college – sem v' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('name_taken');

    const someoneElse = await newUser();
    expect((await someoneElse.post('/timetables', college)).status).toBe(201);
  });

  it('can be changed one setting at a time, with the result checked as a whole', async () => {
    const user = await newUser();
    const { id } = (await user.post('/timetables', college)).body.timetable;

    const renamed = await user.patch(`/timetables/${id}`, { name: 'Sem V', endsOn: null });
    expect(renamed.status).toBe(200);
    expect(renamed.body.timetable).toMatchObject({ name: 'Sem V', endsOn: null, requiredPercent: 75, condonationPercent: 65 });
    expect(new Date(renamed.body.timetable.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(renamed.body.timetable.createdAt).getTime());

    const clash = await user.patch(`/timetables/${id}`, { requiredPercent: 60 });
    expect(clash.status).toBe(400);
    expect(clash.body.message).toBe('Condonation percentage must be below the required percentage');

    const cleared = await user.patch(`/timetables/${id}`, { requiredPercent: null, condonationPercent: null });
    expect(cleared.body.timetable).toMatchObject({ requiredPercent: null, condonationPercent: null });

    const backwards = await user.patch(`/timetables/${id}`, { endsOn: '2026-07-01' });
    expect(backwards.status).toBe(400);

    expect((await user.patch(`/timetables/${id}`, {})).body.message).toBe('Send at least one setting to change');
  });

  it('can be archived and brought back, freeing the name while archived', async () => {
    const user = await newUser();
    const { id } = (await user.post('/timetables', college)).body.timetable;

    const archived = await user.patch(`/timetables/${id}`, { archived: true });
    expect(archived.body.timetable.archived).toBe(true);
    expect((await user.get('/timetables')).body.timetables).toHaveLength(0);
    expect((await user.get('/timetables?archived=true')).body.timetables).toHaveLength(1);

    const replacement = await user.post('/timetables', college);
    expect(replacement.status).toBe(201);

    const restore = await user.patch(`/timetables/${id}`, { archived: false });
    expect(restore.status).toBe(409);
    expect(restore.body.error).toBe('name_taken');

    const restored = await user.patch(`/timetables/${id}`, { archived: false, name: 'College – Sem V (old)' });
    expect(restored.status).toBe(200);
    expect(restored.body.timetable.archived).toBe(false);
  });

  it('are deleted for good, with everything in them', async () => {
    const user = await newUser();
    const { id } = (await user.post('/timetables', college)).body.timetable;
    await pool.query("INSERT INTO subjects (timetable_id, name) VALUES ($1, 'DWDM')", [id]);

    expect((await user.delete(`/timetables/${id}`)).status).toBe(204);
    expect((await user.get(`/timetables/${id}`)).status).toBe(404);
    expect((await user.delete(`/timetables/${id}`)).status).toBe(404);
    const { rows } = await pool.query('SELECT 1 FROM subjects WHERE timetable_id = $1', [id]);
    expect(rows).toHaveLength(0);
  });

  it('are private: another user gets "not found" for everything', async () => {
    const owner = await newUser('owner');
    const intruder = await newUser('intruder');
    const { id } = (await owner.post('/timetables', college)).body.timetable;

    const attempts = [
      await intruder.get(`/timetables/${id}`),
      await intruder.patch(`/timetables/${id}`, { name: 'Mine now' }),
      await intruder.patch(`/timetables/${id}`, { archived: true }),
      await intruder.delete(`/timetables/${id}`),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found', message: 'Timetable not found' });
    }
    expect((await intruder.get('/timetables?archived=true')).body.timetables).toHaveLength(0);
    expect((await owner.get(`/timetables/${id}`)).body.timetable.name).toBe('College – Sem V');
  });

  it('answer "not found" for ids that are not ids', async () => {
    const user = await newUser();
    for (const bad of ['0', '-1', 'abc', '1.5', '99999999999999999999', "1;DROP TABLE users"]) {
      const res = await user.get(`/timetables/${encodeURIComponent(bad)}`);
      expect(res.status, bad).toBe(404);
    }
  });

  it('need a login', async () => {
    expect((await request(app).get('/timetables')).status).toBe(401);
    expect((await request(app).post('/timetables').send(college)).status).toBe(401);
  });

  it(`are limited to ${MAX_ACTIVE_TIMETABLES} active ones per user, even when created all at once`, async () => {
    const user = await newUser();
    const results = await Promise.all(
      Array.from({ length: MAX_ACTIVE_TIMETABLES + 5 }, (_, i) => user.post('/timetables', { name: `T${i}`, startsOn: '2026-07-20' }))
    );
    expect(results.filter((res) => res.status === 201)).toHaveLength(MAX_ACTIVE_TIMETABLES);
    expect(results.filter((res) => res.status === 409).every((res) => res.body.error === 'too_many_timetables')).toBe(true);

    const first = results.find((res) => res.status === 201)!.body.timetable.id;
    await user.patch(`/timetables/${first}`, { archived: true });
    expect((await user.post('/timetables', { name: 'After archiving', startsOn: '2026-07-20' })).status).toBe(201);
    expect((await user.patch(`/timetables/${first}`, { archived: false })).body.error).toBe('too_many_timetables');
  });
});
