import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import type { CreateSubject, UpdateSubject } from './schemas.ts';

export const MAX_SUBJECTS = 60;

export const PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea',
] as const;

type Row = {
  id: number;
  timetable_id: number;
  name: string;
  short_name: string | null;
  kind: 'theory' | 'lab' | 'other';
  counts_attendance: boolean;
  count_per_session: boolean;
  colour: string | null;
  archived_at: Date | null;
  created_at: Date;
};

const COLUMNS = 'id, timetable_id, name, short_name, kind, counts_attendance, count_per_session, colour, archived_at, created_at';

export const toSubject = (row: Row) => ({
  id: row.id,
  timetableId: row.timetable_id,
  name: row.name,
  shortName: row.short_name,
  kind: row.kind,
  countsAttendance: row.counts_attendance,
  countPerSession: row.count_per_session,
  colour: row.colour,
  archived: row.archived_at !== null,
  createdAt: row.created_at.toISOString(),
});

const timetableNotFound = () => new HttpError(404, 'not_found', 'Timetable not found');
const subjectNotFound = () => new HttpError(404, 'not_found', 'Subject not found');
const nameTaken = () => new HttpError(409, 'name_taken', 'This timetable already has a subject with this name');

const rethrow = (error: unknown): never => {
  if ((error as { code?: string }).code === '23505') throw nameTaken();
  throw error;
};

const lockTimetable = async (client: PoolClient, userId: number, timetableId: number) => {
  const { rows } = await client.query('SELECT id FROM timetables WHERE id = $1 AND user_id = $2 FOR UPDATE', [timetableId, userId]);
  if (rows.length === 0) throw timetableNotFound();
};

export const listSubjects = async (userId: number, timetableId: number, includeArchived: boolean) => {
  const owned = await query('SELECT 1 FROM timetables WHERE id = $1 AND user_id = $2', [timetableId, userId]);
  if (owned.length === 0) throw timetableNotFound();
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM subjects WHERE timetable_id = $1 AND ($2 OR archived_at IS NULL)
      ORDER BY archived_at IS NOT NULL, created_at, id`,
    [timetableId, includeArchived]
  );
  return rows.map(toSubject);
};

const pickColour = async (client: PoolClient, timetableId: number) => {
  const { rows } = await client.query<{ colour: string; uses: number }>(
    `SELECT p.colour, count(s.id)::int AS uses
       FROM unnest($2::text[]) WITH ORDINALITY AS p(colour, position)
       LEFT JOIN subjects s ON s.timetable_id = $1 AND s.colour = p.colour AND s.archived_at IS NULL
      GROUP BY p.colour, p.position
      ORDER BY uses, p.position
      LIMIT 1`,
    [timetableId, PALETTE]
  );
  return rows[0]!.colour;
};

export const createSubject = (userId: number, timetableId: number, input: CreateSubject) =>
  withTransaction(async (client) => {
    await lockTimetable(client, userId, timetableId);
    const { rows: counted } = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM subjects WHERE timetable_id = $1 AND archived_at IS NULL',
      [timetableId]
    );
    if (counted[0]!.count >= MAX_SUBJECTS) {
      throw new HttpError(409, 'too_many_subjects', `A timetable can have up to ${MAX_SUBJECTS} subjects`);
    }
    const colour = input.colour ?? (await pickColour(client, timetableId));
    const countsAttendance = input.countsAttendance ?? input.kind !== 'other';
    try {
      const { rows } = await client.query<Row>(
        `INSERT INTO subjects (timetable_id, name, short_name, kind, counts_attendance, count_per_session, colour)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
        [timetableId, input.name, input.shortName, input.kind, countsAttendance, input.countPerSession, colour]
      );
      return toSubject(rows[0]!);
    } catch (error) {
      return rethrow(error);
    }
  });

export const updateSubject = (userId: number, timetableId: number, subjectId: number, changes: UpdateSubject) =>
  withTransaction(async (client) => {
    await lockTimetable(client, userId, timetableId);
    const { rows: found } = await client.query<Row>(`SELECT ${COLUMNS} FROM subjects WHERE id = $1 AND timetable_id = $2 FOR UPDATE`, [
      subjectId,
      timetableId,
    ]);
    const current = found[0];
    if (!current) throw subjectNotFound();
    const before = toSubject(current);
    const archived = changes.archived ?? before.archived;
    if (before.archived && !archived) {
      const { rows: counted } = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM subjects WHERE timetable_id = $1 AND archived_at IS NULL',
        [timetableId]
      );
      if (counted[0]!.count >= MAX_SUBJECTS) {
        throw new HttpError(409, 'too_many_subjects', `A timetable can have up to ${MAX_SUBJECTS} subjects`);
      }
    }
    try {
      const { rows } = await client.query<Row>(
        `UPDATE subjects
            SET name = $3, short_name = $4, kind = $5, counts_attendance = $6, count_per_session = $7, colour = $8,
                archived_at = CASE WHEN $9 THEN coalesce(archived_at, now()) ELSE NULL END
          WHERE id = $1 AND timetable_id = $2
          RETURNING ${COLUMNS}`,
        [
          subjectId,
          timetableId,
          changes.name ?? before.name,
          changes.shortName === undefined ? before.shortName : changes.shortName,
          changes.kind ?? before.kind,
          changes.countsAttendance ?? before.countsAttendance,
          changes.countPerSession ?? before.countPerSession,
          changes.colour === undefined ? before.colour : changes.colour,
          archived,
        ]
      );
      return toSubject(rows[0]!);
    } catch (error) {
      return rethrow(error);
    }
  });

export const deleteSubject = (userId: number, timetableId: number, subjectId: number) =>
  withTransaction(async (client) => {
    await lockTimetable(client, userId, timetableId);
    try {
      const { rows } = await client.query('DELETE FROM subjects WHERE id = $1 AND timetable_id = $2 RETURNING id', [subjectId, timetableId]);
      if (rows.length === 0) throw subjectNotFound();
    } catch (error) {
      if ((error as { code?: string }).code === '23503') {
        throw new HttpError(
          409,
          'subject_in_use',
          'This subject is used in the timetable or has attendance history. Archive it instead, or remove it from the timetable first.'
        );
      }
      throw error;
    }
  });
