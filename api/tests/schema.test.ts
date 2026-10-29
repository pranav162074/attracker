import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import { pool, query, closePool, withTransaction } from '../src/db/pool.ts';
import { skipWithoutDatabase } from './db.ts';

const userIds: number[] = [];

const one = async <Row extends Record<string, unknown>>(text: string, params: unknown[] = []) => {
  const rows = await query<Row>(text, params);
  if (!rows[0]) throw new Error(`No row returned by: ${text}`);
  return rows[0];
};

const makeUser = async () => {
  const user = await one<{ id: number }>('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [
    `schema-${randomUUID()}@example.com`,
    'not-a-real-hash',
  ]);
  userIds.push(user.id);
  return user.id;
};

const makeTimetable = async (userId?: number) => {
  const owner = userId ?? (await makeUser());
  const timetable = await one<{ id: number }>(
    `INSERT INTO timetables (user_id, name, starts_on, ends_on, required_bp, condonation_bp)
     VALUES ($1, $2, '2026-07-20', '2026-11-14', 7500, 6500) RETURNING id`,
    [owner, `College ${randomUUID().slice(0, 8)}`]
  );
  const subject = async (name: string, kind = 'theory') =>
    (await one<{ id: number }>('INSERT INTO subjects (timetable_id, name, kind) VALUES ($1, $2, $3) RETURNING id', [timetable.id, name, kind])).id;
  const dwdm = await subject('Data Warehousing and Data Mining');
  const lab = await subject('OOAD Lab', 'lab');
  const version = await one<{ id: number }>(
    "INSERT INTO grid_versions (timetable_id, effective_from) VALUES ($1, '2026-07-20') RETURNING id",
    [timetable.id]
  );
  const slot = async (subjectId: number, weekday: number, start: number, end: number, periods = 1) =>
    (
      await one<{ id: number }>(
        `INSERT INTO grid_slots (timetable_id, version_id, subject_id, weekday, start_minute, end_minute, periods)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [timetable.id, version.id, subjectId, weekday, start, end, periods]
      )
    ).id;
  return { userId: owner, timetableId: timetable.id, versionId: version.id, dwdm, lab, slot };
};

const minutes = (clock: string) => {
  const [hours, mins] = clock.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
};

const rejects = async (text: string, params: unknown[], code: string) => {
  await expect(pool.query(text, params)).rejects.toMatchObject({ code });
};

afterAll(async () => {
  if (userIds.length > 0) await pool.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]).catch(() => undefined);
  await closePool();
});

describe.skipIf(skipWithoutDatabase)('the database schema', () => {
  describe('timetable grid', () => {
    it('accepts back-to-back periods and a 3-period lab', async () => {
      const t = await makeTimetable();
      await t.slot(t.lab, 1, minutes('08:40'), minutes('11:10'), 3);
      await t.slot(t.dwdm, 1, minutes('12:00'), minutes('12:50'));
      await t.slot(t.dwdm, 3, minutes('08:40'), minutes('09:30'));
      await t.slot(t.dwdm, 3, minutes('09:30'), minutes('10:20'));
      const { count } = await one<{ count: number }>('SELECT count(*)::int AS count FROM grid_slots WHERE timetable_id = $1', [t.timetableId]);
      expect(count).toBe(4);
    });

    it('refuses two classes at overlapping times on the same day', async () => {
      const t = await makeTimetable();
      await t.slot(t.lab, 1, minutes('08:40'), minutes('11:10'), 3);
      await expect(t.slot(t.dwdm, 1, minutes('10:20'), minutes('11:10'))).rejects.toMatchObject({ code: '23P01' });
    });

    it('allows the same time on a different day or in a later version', async () => {
      const t = await makeTimetable();
      await t.slot(t.lab, 1, minutes('08:40'), minutes('11:10'), 3);
      await t.slot(t.dwdm, 2, minutes('08:40'), minutes('09:30'));
      const later = await one<{ id: number }>(
        "INSERT INTO grid_versions (timetable_id, effective_from) VALUES ($1, '2026-09-15') RETURNING id",
        [t.timetableId]
      );
      await pool.query(
        'INSERT INTO grid_slots (timetable_id, version_id, subject_id, weekday, start_minute, end_minute) VALUES ($1, $2, $3, 1, $4, $5)',
        [t.timetableId, later.id, t.dwdm, minutes('08:40'), minutes('09:30')]
      );
    });

    it('refuses a class that ends before it starts, or impossible days and lengths', async () => {
      const t = await makeTimetable();
      await expect(t.slot(t.dwdm, 1, minutes('10:00'), minutes('09:00'))).rejects.toMatchObject({ code: '23514' });
      await expect(t.slot(t.dwdm, 8, minutes('09:00'), minutes('10:00'))).rejects.toMatchObject({ code: '23514' });
      await expect(t.slot(t.dwdm, 1, minutes('09:00'), minutes('10:00'), 0)).rejects.toMatchObject({ code: '23514' });
    });

    it('refuses a class that uses a subject from another timetable', async () => {
      const mine = await makeTimetable();
      const theirs = await makeTimetable();
      await expect(mine.slot(theirs.dwdm, 1, minutes('09:00'), minutes('10:00'))).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('marks and extra classes', () => {
    it('keeps one mark per class per day', async () => {
      const t = await makeTimetable();
      const slot = await t.slot(t.dwdm, 1, minutes('12:00'), minutes('12:50'));
      const mark = "INSERT INTO class_marks (timetable_id, slot_id, on_date, attendance) VALUES ($1, $2, '2026-07-20', $3)";
      await pool.query(mark, [t.timetableId, slot, 'absent']);
      await rejects(mark, [t.timetableId, slot, 'cancelled'], '23505');
    });

    it('only stores "present" for a substitution, and never substitutes a cancelled class', async () => {
      const t = await makeTimetable();
      const slot = await t.slot(t.dwdm, 1, minutes('12:00'), minutes('12:50'));
      const sql = 'INSERT INTO class_marks (timetable_id, slot_id, on_date, attendance, substitute_subject_id) VALUES ($1, $2, $3, $4, $5)';
      await rejects(sql, [t.timetableId, slot, '2026-07-20', 'present', null], '23514');
      await rejects(sql, [t.timetableId, slot, '2026-07-27', 'cancelled', t.lab], '23514');
      await pool.query(sql, [t.timetableId, slot, '2026-08-03', 'present', t.lab]);
      await pool.query(sql, [t.timetableId, slot, '2026-08-10', 'absent', t.lab]);
    });

    it('refuses a mark on another timetable\'s class', async () => {
      const mine = await makeTimetable();
      const theirs = await makeTimetable();
      const theirSlot = await theirs.slot(theirs.dwdm, 1, minutes('12:00'), minutes('12:50'));
      await rejects(
        "INSERT INTO class_marks (timetable_id, slot_id, on_date, attendance) VALUES ($1, $2, '2026-07-20', 'absent')",
        [mine.timetableId, theirSlot],
        '23503'
      );
    });

    it('refuses an extra class for a subject from another timetable', async () => {
      const mine = await makeTimetable();
      const theirs = await makeTimetable();
      await rejects(
        "INSERT INTO extra_classes (timetable_id, subject_id, on_date, start_minute, end_minute) VALUES ($1, $2, '2026-08-01', 540, 590)",
        [mine.timetableId, theirs.dwdm],
        '23503'
      );
    });
  });

  describe('calendar', () => {
    it('stores holidays, breaks, half days and Saturdays that follow a weekday', async () => {
      const t = await makeTimetable();
      const sql = `INSERT INTO calendar_days (timetable_id, starts_on, ends_on, kind, follows_weekday, cutoff_minute, label)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`;
      await pool.query(sql, [t.timetableId, '2026-08-15', '2026-08-15', 'holiday', null, null, 'Independence Day']);
      await pool.query(sql, [t.timetableId, '2026-09-07', '2026-09-12', 'holiday', null, null, 'Mid exams']);
      await pool.query(sql, [t.timetableId, '2026-08-22', '2026-08-22', 'follows_weekday', 1, null, null]);
      await pool.query(sql, [t.timetableId, '2026-08-28', '2026-08-28', 'no_classes_after', null, minutes('12:00'), 'Half day']);
    });

    it('refuses two rules for the same day', async () => {
      const t = await makeTimetable();
      const sql = 'INSERT INTO calendar_days (timetable_id, starts_on, ends_on, kind, follows_weekday) VALUES ($1, $2, $3, $4, $5)';
      await pool.query(sql, [t.timetableId, '2026-09-07', '2026-09-12', 'holiday', null]);
      await rejects(sql, [t.timetableId, '2026-09-12', '2026-09-12', 'follows_weekday', 1], '23P01');
    });

    it('refuses rules that do not make sense', async () => {
      const t = await makeTimetable();
      const sql = `INSERT INTO calendar_days (timetable_id, starts_on, ends_on, kind, follows_weekday, cutoff_minute)
                   VALUES ($1, $2, $3, $4, $5, $6)`;
      await rejects(sql, [t.timetableId, '2026-08-22', '2026-08-22', 'follows_weekday', null, null], '23514');
      await rejects(sql, [t.timetableId, '2026-08-22', '2026-08-29', 'follows_weekday', 1, null], '23514');
      await rejects(sql, [t.timetableId, '2026-08-28', '2026-08-28', 'no_classes_after', null, null], '23514');
      await rejects(sql, [t.timetableId, '2026-08-28', '2026-08-27', 'holiday', null, null], '23514');
    });
  });

  describe('checkpoints and settings', () => {
    it('refuses more attended than held', async () => {
      const t = await makeTimetable();
      const checkpoint = await one<{ id: number }>(
        "INSERT INTO checkpoints (timetable_id, as_of, free_held, free_attended, source) VALUES ($1, '2026-09-30', 8, 8, 'sheet') RETURNING id",
        [t.timetableId]
      );
      const sql = 'INSERT INTO checkpoint_subjects (timetable_id, checkpoint_id, subject_id, held, attended) VALUES ($1, $2, $3, $4, $5)';
      await pool.query(sql, [t.timetableId, checkpoint.id, t.dwdm, 32, 15]);
      await rejects(sql, [t.timetableId, checkpoint.id, t.lab, 30, 31], '23514');
      await rejects(
        "INSERT INTO checkpoints (timetable_id, as_of, free_held, free_attended, source) VALUES ($1, '2026-10-31', 3, 5, 'manual')",
        [t.timetableId],
        '23514'
      );
    });

    it('needs the condonation line below the required line, and an end after the start', async () => {
      const userId = await makeUser();
      const sql = 'INSERT INTO timetables (user_id, name, starts_on, ends_on, required_bp, condonation_bp) VALUES ($1, $2, $3, $4, $5, $6)';
      await rejects(sql, [userId, 'A', '2026-07-20', '2026-11-14', 7500, 7500], '23514');
      await rejects(sql, [userId, 'B', '2026-07-20', '2026-11-14', null, 6500], '23514');
      await rejects(sql, [userId, 'C', '2026-11-14', '2026-07-20', 7500, 6500], '23514');
      await pool.query(sql, [userId, 'Dance', '2026-08-01', null, null, null]);
    });

    it('refuses two active timetables with the same name for one user, ignoring case', async () => {
      const userId = await makeUser();
      const sql = "INSERT INTO timetables (user_id, name, starts_on) VALUES ($1, $2, '2026-07-20')";
      await pool.query(sql, [userId, 'Dance']);
      await rejects(sql, [userId, ' dance '], '23505');
    });

    it('stores emails in lower case only, once', async () => {
      const email = `Case-${randomUUID()}@Example.com`;
      await rejects('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, 'x'], '23514');
      const user = await one<{ id: number }>('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [email.toLowerCase(), 'x']);
      userIds.push(user.id);
      await rejects('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email.toLowerCase(), 'y'], '23505');
    });
  });

  describe('deleting', () => {
    it('will not delete a subject that classes still use', async () => {
      const t = await makeTimetable();
      await t.slot(t.dwdm, 1, minutes('12:00'), minutes('12:50'));
      await rejects('DELETE FROM subjects WHERE id = $1', [t.dwdm], '23503');
    });

    it('will not drop a timetable version that still holds your marks', async () => {
      const t = await makeTimetable();
      const slot = await t.slot(t.dwdm, 1, minutes('12:00'), minutes('12:50'));
      await pool.query("INSERT INTO class_marks (timetable_id, slot_id, on_date, attendance) VALUES ($1, $2, '2026-07-20', 'absent')", [t.timetableId, slot]);
      await rejects('DELETE FROM grid_versions WHERE id = $1', [t.versionId], '23503');
    });

    it('removes everything of a user when the account is deleted', async () => {
      const t = await makeTimetable();
      const slot = await t.slot(t.lab, 2, minutes('08:40'), minutes('11:10'), 3);
      await pool.query("INSERT INTO class_marks (timetable_id, slot_id, on_date, attendance) VALUES ($1, $2, '2026-07-21', 'absent')", [t.timetableId, slot]);
      await pool.query("INSERT INTO extra_classes (timetable_id, subject_id, on_date, start_minute, end_minute) VALUES ($1, $2, '2026-08-01', 540, 590)", [t.timetableId, t.dwdm]);
      await pool.query("INSERT INTO calendar_days (timetable_id, starts_on, ends_on, kind) VALUES ($1, '2026-08-15', '2026-08-15', 'holiday')", [t.timetableId]);
      const checkpoint = await one<{ id: number }>("INSERT INTO checkpoints (timetable_id, as_of, source) VALUES ($1, '2026-09-30', 'manual') RETURNING id", [t.timetableId]);
      await pool.query('INSERT INTO checkpoint_subjects (timetable_id, checkpoint_id, subject_id, held, attended) VALUES ($1, $2, $3, 30, 18)', [t.timetableId, checkpoint.id, t.lab]);
      await pool.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')", [t.userId, Buffer.alloc(32, 1)]);

      await pool.query('DELETE FROM users WHERE id = $1', [t.userId]);

      const { count: timetables } = await one<{ count: number }>('SELECT count(*)::int AS count FROM timetables WHERE id = $1', [t.timetableId]);
      expect(timetables).toBe(0);
      for (const table of ['subjects', 'grid_versions', 'grid_slots', 'class_marks', 'extra_classes', 'calendar_days', 'checkpoints', 'checkpoint_subjects']) {
        const { count } = await one<{ count: number }>(`SELECT count(*)::int AS count FROM ${table} WHERE timetable_id = $1`, [t.timetableId]);
        expect(count, table).toBe(0);
      }
      const { count } = await one<{ count: number }>('SELECT count(*)::int AS count FROM sessions WHERE user_id = $1', [t.userId]);
      expect(count).toBe(0);
    });
  });

  describe('the pool', () => {
    it('returns dates as plain YYYY-MM-DD text and ids as numbers', async () => {
      const t = await makeTimetable();
      const row = await one<{ id: unknown; starts_on: unknown }>('SELECT id, starts_on FROM timetables WHERE id = $1', [t.timetableId]);
      expect(row.starts_on).toBe('2026-07-20');
      expect(typeof row.id).toBe('number');
    });

    it('rolls a transaction back completely when anything in it fails', async () => {
      const userId = await makeUser();
      await expect(
        withTransaction(async (client) => {
          await client.query("INSERT INTO timetables (user_id, name, starts_on) VALUES ($1, 'Rolled back', '2026-07-20')", [userId]);
          await client.query("INSERT INTO timetables (user_id, name, starts_on) VALUES ($1, 'Rolled back', '2026-07-20')", [userId]);
        })
      ).rejects.toMatchObject({ code: '23505' });
      const { count } = await one<{ count: number }>('SELECT count(*)::int AS count FROM timetables WHERE user_id = $1', [userId]);
      expect(count).toBe(0);
    });
  });
});
