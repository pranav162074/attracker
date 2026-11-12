import { z } from 'zod';
import { nowIn } from '../attendance/load.ts';
import { query, withTransaction } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import { COLUMNS, lockActiveCount, MAX_ACTIVE_TIMETABLES, rethrow, toTimetable, tooMany } from '../timetables/repo.ts';
import type { Row } from '../timetables/repo.ts';
import { formatShareCode, newShareCode } from './codes.ts';

export const copySchema = z.strictObject({
  name: z.string({ error: 'Give the semester a name' }).trim().min(1, 'Give the semester a name').max(60, 'Name must be at most 60 characters').optional(),
});

export type CopyInput = z.infer<typeof copySchema>;

const notFound = () => new HttpError(404, 'not_found', 'Timetable not found');
const unknownCode = () => new HttpError(404, 'unknown_code', 'No timetable has this code. Check it with the person who shared it.');

const owned = async (userId: number, timetableId: number) => {
  const rows = await query<{ id: number }>('SELECT id FROM timetables WHERE id = $1 AND user_id = $2', [timetableId, userId]);
  if (!rows[0]) throw notFound();
};

export const getShareCode = async (userId: number, timetableId: number) => {
  await owned(userId, timetableId);
  const rows = await query<{ code: string }>('SELECT code FROM share_codes WHERE timetable_id = $1', [timetableId]);
  return rows[0] ? formatShareCode(rows[0].code) : null;
};

export const createShareCode = async (userId: number, timetableId: number) => {
  await owned(userId, timetableId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rows = await query<{ code: string }>(
      `INSERT INTO share_codes (code, timetable_id) VALUES ($1, $2)
       ON CONFLICT (timetable_id) DO UPDATE SET timetable_id = EXCLUDED.timetable_id
       RETURNING code`,
      [newShareCode(), timetableId]
    ).catch((error: unknown) => {
      if ((error as { code?: string }).code === '23505') return [];
      throw error;
    });
    if (rows[0]) return formatShareCode(rows[0].code);
  }
  throw new HttpError(503, 'try_again', 'Could not make a code just now. Try again.');
};

type Source = Row & { time_zone: string };

const sourceFor = async (code: string) => {
  const rows = await query<Source>(`SELECT ${COLUMNS.split(', ').map((column) => `t.${column}`).join(', ')} FROM share_codes c JOIN timetables t ON t.id = c.timetable_id WHERE c.code = $1`, [code]);
  if (!rows[0]) throw unknownCode();
  return rows[0];
};

const versionFor = async (source: Source) => {
  const today = nowIn(source.time_zone).date;
  const rows = await query<{ id: number }>(
    `SELECT id FROM grid_versions WHERE timetable_id = $1
     ORDER BY (effective_from <= $2) DESC, CASE WHEN effective_from <= $2 THEN effective_from END DESC, effective_from
     LIMIT 1`,
    [source.id, today]
  );
  return rows[0]?.id ?? null;
};

export const previewShared = async (code: string) => {
  const source = await sourceFor(code);
  const version = await versionFor(source);
  const [subjects, classes, days] = await Promise.all([
    query<{ name: string; kind: 'theory' | 'lab' | 'other'; counts_attendance: boolean }>(
      'SELECT name, kind, counts_attendance FROM subjects WHERE timetable_id = $1 AND archived_at IS NULL ORDER BY created_at, id',
      [source.id]
    ),
    version === null
      ? Promise.resolve([{ count: 0 }])
      : query<{ count: number }>(
          'SELECT count(*)::int AS count FROM grid_slots g JOIN subjects s ON s.id = g.subject_id WHERE g.version_id = $1 AND s.archived_at IS NULL',
          [version]
        ),
    query<{ count: number }>('SELECT count(*)::int AS count FROM calendar_days WHERE timetable_id = $1', [source.id]),
  ]);
  const timetable = toTimetable(source);
  return {
    code: formatShareCode(code),
    name: timetable.name,
    startsOn: timetable.startsOn,
    endsOn: timetable.endsOn,
    requiredPercent: timetable.requiredPercent,
    condonationPercent: timetable.condonationPercent,
    subjects: subjects.map((row) => ({ name: row.name, kind: row.kind, countsAttendance: row.counts_attendance })),
    classesPerWeek: classes[0]?.count ?? 0,
    specialDays: days[0]?.count ?? 0,
  };
};

export const copyShared = async (userId: number, code: string, input: CopyInput) => {
  const source = await sourceFor(code);
  const version = await versionFor(source);
  return withTransaction(async (client) => {
    if ((await lockActiveCount(client, userId)) >= MAX_ACTIVE_TIMETABLES) throw tooMany();
    let created: Row;
    try {
      const { rows } = await client.query<Row>(
        `INSERT INTO timetables (user_id, name, starts_on, ends_on, time_zone, required_bp, condonation_bp)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
        [userId, input.name ?? source.name, source.starts_on, source.ends_on, source.time_zone, source.required_bp, source.condonation_bp]
      );
      created = rows[0]!;
    } catch (error) {
      return rethrow(error);
    }
    await client.query(
      `CREATE TEMP TABLE copied_subjects ON COMMIT DROP AS
       WITH old AS (
         SELECT id, name, short_name, kind, counts_attendance, count_per_session, colour, row_number() OVER (ORDER BY created_at, id) AS position
           FROM subjects WHERE timetable_id = $1 AND archived_at IS NULL
       ),
       made AS (
         INSERT INTO subjects (timetable_id, name, short_name, kind, counts_attendance, count_per_session, colour, created_at)
         SELECT $2, name, short_name, kind, counts_attendance, count_per_session, colour, now() + position * interval '1 microsecond' FROM old ORDER BY position
         RETURNING id, name
       )
       SELECT old.id AS old_id, made.id AS new_id FROM old JOIN made ON lower(btrim(made.name)) = lower(btrim(old.name))`,
      [source.id, created.id]
    );
    if (version !== null) {
      const { rows } = await client.query<{ id: number }>('INSERT INTO grid_versions (timetable_id, effective_from) VALUES ($1, $2) RETURNING id', [created.id, source.starts_on]);
      await client.query(
        `INSERT INTO grid_slots (timetable_id, version_id, subject_id, weekday, start_minute, end_minute, periods)
         SELECT $1, $2, c.new_id, g.weekday, g.start_minute, g.end_minute, g.periods
           FROM grid_slots g JOIN copied_subjects c ON c.old_id = g.subject_id
          WHERE g.version_id = $3`,
        [created.id, rows[0]!.id, version]
      );
    }
    await client.query(
      `INSERT INTO calendar_days (timetable_id, starts_on, ends_on, kind, follows_weekday, cutoff_minute, label)
       SELECT $1, starts_on, ends_on, kind, follows_weekday, cutoff_minute, label FROM calendar_days WHERE timetable_id = $2`,
      [created.id, source.id]
    );
    return toTimetable(created);
  });
};
