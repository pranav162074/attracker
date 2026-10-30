import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import { settingsProblem } from './schemas.ts';
import type { TimetableSettings, UpdateTimetable } from './schemas.ts';

export const MAX_ACTIVE_TIMETABLES = 20;

type Row = {
  id: number;
  name: string;
  starts_on: string;
  ends_on: string | null;
  time_zone: string;
  required_bp: number | null;
  condonation_bp: number | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = 'id, name, starts_on, ends_on, time_zone, required_bp, condonation_bp, archived_at, created_at, updated_at';

const toBp = (percent: number | null) => (percent === null ? null : Math.round(percent * 100));
const fromBp = (bp: number | null) => (bp === null ? null : bp / 100);

export const toTimetable = (row: Row) => ({
  id: row.id,
  name: row.name,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  timeZone: row.time_zone,
  requiredPercent: fromBp(row.required_bp),
  condonationPercent: fromBp(row.condonation_bp),
  archived: row.archived_at !== null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const nameTaken = () => new HttpError(409, 'name_taken', 'You already have a timetable with this name');
const notFound = () => new HttpError(404, 'not_found', 'Timetable not found');

const rethrow = (error: unknown): never => {
  if ((error as { code?: string }).code === '23505') throw nameTaken();
  throw error;
};

export const listTimetables = async (userId: number, includeArchived: boolean) => {
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM timetables WHERE user_id = $1 AND ($2 OR archived_at IS NULL) ORDER BY archived_at IS NOT NULL, created_at, id`,
    [userId, includeArchived]
  );
  return rows.map(toTimetable);
};

export const getTimetable = async (userId: number, id: number) => {
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM timetables WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rows[0]) throw notFound();
  return toTimetable(rows[0]);
};

const lockActiveCount = async (client: PoolClient, userId: number) => {
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const { rows } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM timetables WHERE user_id = $1 AND archived_at IS NULL', [userId]);
  return rows[0]!.count;
};

const tooMany = () =>
  new HttpError(409, 'too_many_timetables', `You can have up to ${MAX_ACTIVE_TIMETABLES} active timetables. Archive or delete one first.`);

export const createTimetable = (userId: number, settings: TimetableSettings) =>
  withTransaction(async (client) => {
    if ((await lockActiveCount(client, userId)) >= MAX_ACTIVE_TIMETABLES) throw tooMany();
    try {
      const { rows } = await client.query<Row>(
        `INSERT INTO timetables (user_id, name, starts_on, ends_on, time_zone, required_bp, condonation_bp)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
        [userId, settings.name, settings.startsOn, settings.endsOn, settings.timeZone, toBp(settings.requiredPercent), toBp(settings.condonationPercent)]
      );
      return toTimetable(rows[0]!);
    } catch (error) {
      return rethrow(error);
    }
  });

export const updateTimetable = (userId: number, id: number, changes: UpdateTimetable) =>
  withTransaction(async (client) => {
    const { rows: found } = await client.query<Row>(`SELECT ${COLUMNS} FROM timetables WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]);
    const current = found[0];
    if (!current) throw notFound();
    const before = toTimetable(current);
    const next: TimetableSettings = {
      name: changes.name ?? before.name,
      startsOn: changes.startsOn ?? before.startsOn,
      endsOn: changes.endsOn === undefined ? before.endsOn : changes.endsOn,
      timeZone: changes.timeZone ?? before.timeZone,
      requiredPercent: changes.requiredPercent === undefined ? before.requiredPercent : changes.requiredPercent,
      condonationPercent: changes.condonationPercent === undefined ? before.condonationPercent : changes.condonationPercent,
    };
    const problem = settingsProblem(next);
    if (problem) throw new HttpError(400, 'validation_error', problem.message, [problem]);

    const archived = changes.archived ?? before.archived;
    if (before.archived && !archived && (await lockActiveCount(client, userId)) >= MAX_ACTIVE_TIMETABLES) throw tooMany();

    try {
      const { rows } = await client.query<Row>(
        `UPDATE timetables
            SET name = $3, starts_on = $4, ends_on = $5, time_zone = $6, required_bp = $7, condonation_bp = $8,
                archived_at = CASE WHEN $9 THEN coalesce(archived_at, now()) ELSE NULL END,
                updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING ${COLUMNS}`,
        [id, userId, next.name, next.startsOn, next.endsOn, next.timeZone, toBp(next.requiredPercent), toBp(next.condonationPercent), archived]
      );
      return toTimetable(rows[0]!);
    } catch (error) {
      return rethrow(error);
    }
  });

export const deleteTimetable = async (userId: number, id: number) => {
  const rows = await query<{ id: number }>('DELETE FROM timetables WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  if (!rows[0]) throw notFound();
};
