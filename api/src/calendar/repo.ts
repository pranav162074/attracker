import type { PoolClient } from 'pg';
import { parseHolidays } from '@attracker/engine';
import { query, withTransaction } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import { toClock, toMinutes } from '../grid/time.ts';
import { dayProblem, MAX_DAYS } from './schemas.ts';
import type { CalendarDayInput, Kind } from './schemas.ts';

type Row = {
  id: number;
  kind: Kind;
  starts_on: string;
  ends_on: string;
  follows_weekday: number | null;
  cutoff_minute: number | null;
  label: string | null;
};

const COLUMNS = 'id, kind, starts_on, ends_on, follows_weekday, cutoff_minute, label';

export const toDay = (row: Row) => ({
  id: row.id,
  kind: row.kind,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  followsWeekday: row.follows_weekday,
  cutoff: row.cutoff_minute === null ? null : toClock(row.cutoff_minute),
  label: row.label,
});

const KIND_NAMES: Record<Kind, string> = {
  holiday: 'a holiday',
  follows_weekday: 'a day following another weekday',
  no_classes_before: 'a half day',
  no_classes_after: 'a half day',
};

const describe = (row: Row) => {
  const when = row.starts_on === row.ends_on ? row.starts_on : `${row.starts_on} to ${row.ends_on}`;
  return `${when} is already ${KIND_NAMES[row.kind]}${row.label ? ` (${row.label})` : ''}`;
};

type Timetable = { starts_on: string; ends_on: string | null };

const lockTimetable = async (client: PoolClient, userId: number, timetableId: number) => {
  const { rows } = await client.query<Timetable>('SELECT starts_on, ends_on FROM timetables WHERE id = $1 AND user_id = $2 FOR UPDATE', [
    timetableId,
    userId,
  ]);
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Timetable not found');
  return rows[0];
};

const outside = (timetable: Timetable, day: { startsOn: string; endsOn: string }) =>
  day.startsOn < timetable.starts_on || (timetable.ends_on !== null && day.endsOn > timetable.ends_on);

const outsideError = (timetable: Timetable) =>
  new HttpError(
    400,
    'validation_error',
    timetable.ends_on ? `Days must be between ${timetable.starts_on} and ${timetable.ends_on}` : `Days must be on or after ${timetable.starts_on}`
  );

const overlapping = async (client: PoolClient | null, timetableId: number, startsOn: string, endsOn: string, exceptId: number | null) => {
  const sql = `SELECT ${COLUMNS} FROM calendar_days
                WHERE timetable_id = $1 AND daterange(starts_on, ends_on, '[]') && daterange($2::date, $3::date, '[]')
                  AND ($4::bigint IS NULL OR id <> $4)
                ORDER BY starts_on`;
  const params = [timetableId, startsOn, endsOn, exceptId];
  return client ? (await client.query<Row>(sql, params)).rows : query<Row>(sql, params);
};

const insert = async (client: PoolClient, timetableId: number, day: CalendarDayInput) => {
  const { rows } = await client.query<Row>(
    `INSERT INTO calendar_days (timetable_id, kind, starts_on, ends_on, follows_weekday, cutoff_minute, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [timetableId, day.kind, day.startsOn, day.endsOn, day.followsWeekday, day.cutoff === null ? null : toMinutes(day.cutoff), day.label]
  );
  return toDay(rows[0]!);
};

const ensureRoom = async (client: PoolClient, timetableId: number, adding: number) => {
  const { rows } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM calendar_days WHERE timetable_id = $1', [timetableId]);
  if (rows[0]!.count + adding > MAX_DAYS) throw new HttpError(409, 'too_many_days', `A timetable can have up to ${MAX_DAYS} calendar entries`);
};

export const listDays = async (userId: number, timetableId: number, from: string | undefined, to: string | undefined) => {
  const owned = await query('SELECT 1 FROM timetables WHERE id = $1 AND user_id = $2', [timetableId, userId]);
  if (owned.length === 0) throw new HttpError(404, 'not_found', 'Timetable not found');
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM calendar_days
      WHERE timetable_id = $1 AND ($2::date IS NULL OR ends_on >= $2) AND ($3::date IS NULL OR starts_on <= $3)
      ORDER BY starts_on, id`,
    [timetableId, from ?? null, to ?? null]
  );
  return rows.map(toDay);
};

export const addDays = (userId: number, timetableId: number, days: CalendarDayInput[]) =>
  withTransaction(async (client) => {
    const timetable = await lockTimetable(client, userId, timetableId);
    await ensureRoom(client, timetableId, days.length);
    const sorted = [...days].sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.startsOn <= sorted[i - 1]!.endsOn) {
        throw new HttpError(409, 'day_taken', `${sorted[i]!.startsOn} appears twice in this list`);
      }
    }
    const problems: string[] = [];
    for (const day of days) {
      if (outside(timetable, day)) throw outsideError(timetable);
      const clash = await overlapping(client, timetableId, day.startsOn, day.endsOn, null);
      if (clash[0]) problems.push(describe(clash[0]));
    }
    if (problems.length > 0) {
      throw new HttpError(409, 'day_taken', problems.length === 1 ? problems[0]! : `${problems.length} of these days already have an entry`, problems);
    }
    const saved = [];
    for (const day of days) saved.push(await insert(client, timetableId, day));
    return saved;
  });

export const updateDay = (userId: number, timetableId: number, dayId: number, changes: Partial<CalendarDayInput> & { endsOn?: string }) =>
  withTransaction(async (client) => {
    const timetable = await lockTimetable(client, userId, timetableId);
    const { rows } = await client.query<Row>(`SELECT ${COLUMNS} FROM calendar_days WHERE id = $1 AND timetable_id = $2 FOR UPDATE`, [dayId, timetableId]);
    if (!rows[0]) throw new HttpError(404, 'not_found', 'Calendar entry not found');
    const current = toDay(rows[0]);
    const kind = changes.kind ?? current.kind;
    const startsOn = changes.startsOn ?? current.startsOn;
    const next: CalendarDayInput = {
      kind,
      startsOn,
      endsOn: changes.endsOn ?? (changes.startsOn !== undefined && current.startsOn === current.endsOn ? startsOn : current.endsOn),
      followsWeekday: changes.followsWeekday !== undefined ? changes.followsWeekday : kind === 'follows_weekday' ? current.followsWeekday : null,
      cutoff: changes.cutoff !== undefined ? changes.cutoff : kind === 'no_classes_before' || kind === 'no_classes_after' ? current.cutoff : null,
      label: changes.label !== undefined ? changes.label : current.label,
    };
    const problem = dayProblem(next);
    if (problem) throw new HttpError(400, 'validation_error', problem.message, [problem]);
    if (outside(timetable, next)) throw outsideError(timetable);
    const clash = await overlapping(client, timetableId, next.startsOn, next.endsOn, dayId);
    if (clash[0]) throw new HttpError(409, 'day_taken', describe(clash[0]));
    const { rows: updated } = await client.query<Row>(
      `UPDATE calendar_days SET kind = $3, starts_on = $4, ends_on = $5, follows_weekday = $6, cutoff_minute = $7, label = $8
        WHERE id = $1 AND timetable_id = $2 RETURNING ${COLUMNS}`,
      [dayId, timetableId, next.kind, next.startsOn, next.endsOn, next.followsWeekday, next.cutoff === null ? null : toMinutes(next.cutoff), next.label]
    );
    return toDay(updated[0]!);
  });

export const deleteDay = async (userId: number, timetableId: number, dayId: number) => {
  const rows = await query<{ id: number }>(
    `DELETE FROM calendar_days d USING timetables t
      WHERE d.id = $1 AND d.timetable_id = $2 AND t.id = d.timetable_id AND t.user_id = $3
      RETURNING d.id`,
    [dayId, timetableId, userId]
  );
  if (rows.length === 0) {
    const owned = await query('SELECT 1 FROM timetables WHERE id = $1 AND user_id = $2', [timetableId, userId]);
    throw new HttpError(404, 'not_found', owned.length === 0 ? 'Timetable not found' : 'Calendar entry not found');
  }
};

export const previewImport = async (userId: number, timetableId: number, text: string) => {
  const owned = await query<Timetable>('SELECT starts_on, ends_on FROM timetables WHERE id = $1 AND user_id = $2', [timetableId, userId]);
  if (!owned[0]) throw new HttpError(404, 'not_found', 'Timetable not found');
  const timetable = owned[0];
  const parsed = parseHolidays(text);
  const holidays = [];
  for (const holiday of parsed.holidays) {
    const problems: string[] = [];
    if (outside(timetable, holiday)) problems.push('Outside the timetable’s dates');
    const clash = await overlapping(null, timetableId, holiday.startsOn, holiday.endsOn, null);
    if (clash[0]) problems.push(describe(clash[0]));
    holidays.push({ ...holiday, problems });
  }
  return { holidays, skipped: parsed.skipped };
};
