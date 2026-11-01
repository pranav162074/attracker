import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import { dateSchema } from '../timetables/schemas.ts';
import { nowIn } from '../attendance/load.ts';
import { matchSubjects, readStudentRow } from './sheet.ts';

const count = (label: string) =>
  z.number({ error: `${label} must be a whole number` }).int(`${label} must be a whole number`).min(0, `${label} cannot be negative`).max(100_000, `${label} is too large`);

export const saveCheckpointSchema = z
  .strictObject({
    asOf: dateSchema('asOf'),
    source: z.enum(['manual', 'sheet'], { error: 'source must be manual or sheet' }).default('manual'),
    freeHeld: count('freeHeld').default(0),
    freeAttended: count('freeAttended').default(0),
    subjects: z
      .array(
        z.strictObject({
          subjectId: z.number({ error: 'subjectId is required' }).int().positive(),
          held: count('held'),
          attended: count('attended'),
        }),
        { error: 'subjects must be a list' }
      )
      .min(1, 'Give the numbers for at least one subject')
      .max(60, 'Too many subjects'),
  })
  .superRefine((value, ctx) => {
    if (value.freeAttended > value.freeHeld) ctx.addIssue({ code: 'custom', path: ['freeAttended'], message: 'freeAttended cannot be more than freeHeld' });
    const seen = new Set<number>();
    value.subjects.forEach((subject, index) => {
      if (subject.attended > subject.held) ctx.addIssue({ code: 'custom', path: ['subjects', index, 'attended'], message: 'attended cannot be more than held' });
      if (seen.has(subject.subjectId)) ctx.addIssue({ code: 'custom', path: ['subjects', index, 'subjectId'], message: 'Each subject can appear only once' });
      seen.add(subject.subjectId);
    });
  });

export type SaveCheckpoint = z.infer<typeof saveCheckpointSchema>;

type Timetable = { starts_on: string; ends_on: string | null; time_zone: string };

const owned = async (userId: number, timetableId: number) => {
  const rows = await query<Timetable>('SELECT starts_on, ends_on, time_zone FROM timetables WHERE id = $1 AND user_id = $2', [timetableId, userId]);
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Timetable not found');
  return rows[0];
};

type CheckpointRow = { id: number; as_of: string; source: 'manual' | 'sheet'; free_held: number; free_attended: number; created_at: Date };

const withSubjects = async (rows: CheckpointRow[]) => {
  if (rows.length === 0) return [];
  const subjects = await query<{ checkpoint_id: number; subject_id: number; held: number; attended: number }>(
    'SELECT checkpoint_id, subject_id, held, attended FROM checkpoint_subjects WHERE checkpoint_id = ANY($1::bigint[]) ORDER BY subject_id',
    [rows.map((row) => row.id)]
  );
  return rows.map((row) => ({
    id: row.id,
    asOf: row.as_of,
    source: row.source,
    freeHeld: row.free_held,
    freeAttended: row.free_attended,
    createdAt: row.created_at.toISOString(),
    subjects: subjects.filter((s) => s.checkpoint_id === row.id).map((s) => ({ subjectId: s.subject_id, held: s.held, attended: s.attended })),
  }));
};

const COLUMNS = 'id, as_of, source, free_held, free_attended, created_at';

export const listCheckpoints = async (userId: number, timetableId: number) => {
  await owned(userId, timetableId);
  return withSubjects(await query<CheckpointRow>(`SELECT ${COLUMNS} FROM checkpoints WHERE timetable_id = $1 ORDER BY as_of DESC`, [timetableId]));
};

export const saveCheckpoint = (userId: number, timetableId: number, input: SaveCheckpoint) =>
  withTransaction(async (client) => {
    const { rows: locked } = await client.query<Timetable>(
      'SELECT starts_on, ends_on, time_zone FROM timetables WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [timetableId, userId]
    );
    const timetable = locked[0];
    if (!timetable) throw new HttpError(404, 'not_found', 'Timetable not found');
    if (input.asOf < timetable.starts_on || (timetable.ends_on !== null && input.asOf > timetable.ends_on)) {
      throw new HttpError(400, 'validation_error', 'asOf must be within the timetable’s dates');
    }
    if (input.asOf > nowIn(timetable.time_zone).date) throw new HttpError(400, 'validation_error', 'Official numbers cannot be dated in the future');

    const ids = input.subjects.map((subject) => subject.subjectId);
    const { rows: subjects } = await client.query<{ id: number; name: string; counts_attendance: boolean }>(
      'SELECT id, name, counts_attendance FROM subjects WHERE timetable_id = $1 AND id = ANY($2::bigint[])',
      [timetableId, ids]
    );
    const found = new Map(subjects.map((subject) => [subject.id, subject]));
    for (const id of ids) {
      const subject = found.get(id);
      if (!subject) throw new HttpError(400, 'validation_error', `Subject ${id} is not part of this timetable`);
      if (!subject.counts_attendance) throw new HttpError(400, 'validation_error', `${subject.name} does not count for attendance`);
    }

    await client.query('DELETE FROM checkpoints WHERE timetable_id = $1 AND as_of = $2', [timetableId, input.asOf]);
    const { rows } = await client.query<CheckpointRow>(
      `INSERT INTO checkpoints (timetable_id, as_of, free_held, free_attended, source) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [timetableId, input.asOf, input.freeHeld, input.freeAttended, input.source]
    );
    const checkpoint = rows[0]!;
    await client.query(
      `INSERT INTO checkpoint_subjects (timetable_id, checkpoint_id, subject_id, held, attended)
       SELECT $1, $2, s.subject_id, s.held, s.attended FROM unnest($3::bigint[], $4::int[], $5::int[]) AS s(subject_id, held, attended)`,
      [timetableId, checkpoint.id, ids, input.subjects.map((s) => s.held), input.subjects.map((s) => s.attended)]
    );
    return {
      id: checkpoint.id,
      asOf: checkpoint.as_of,
      source: checkpoint.source,
      freeHeld: checkpoint.free_held,
      freeAttended: checkpoint.free_attended,
      createdAt: checkpoint.created_at.toISOString(),
      subjects: [...input.subjects].sort((a, b) => a.subjectId - b.subjectId),
    };
  });

export const deleteCheckpoint = async (userId: number, timetableId: number, checkpointId: number) => {
  await owned(userId, timetableId);
  const rows = await query('DELETE FROM checkpoints WHERE id = $1 AND timetable_id = $2 RETURNING id', [checkpointId, timetableId]);
  if (rows.length === 0) throw new HttpError(404, 'not_found', 'Checkpoint not found');
};

export const previewSheet = async (userId: number, timetableId: number, file: Buffer, registration: string) => {
  await owned(userId, timetableId);
  const student = readStudentRow(file, registration);
  const subjects = await query<{ id: number; name: string; short_name: string | null }>(
    'SELECT id, name, short_name FROM subjects WHERE timetable_id = $1 AND archived_at IS NULL AND counts_attendance ORDER BY created_at, id',
    [timetableId]
  );
  const matched = matchSubjects(
    student.subjects,
    subjects.map((subject) => ({ id: subject.id, name: subject.name, shortName: subject.short_name }))
  );
  const heldSum = student.subjects.reduce((sum, subject) => sum + subject.held, 0);
  const attendedSum = student.subjects.reduce((sum, subject) => sum + subject.attended, 0);
  const freeHeld = student.totalHeld !== null && student.totalHeld > heldSum ? student.totalHeld - heldSum : 0;
  const freeAttended = student.totalAttended !== null && student.totalAttended > attendedSum ? Math.min(student.totalAttended - attendedSum, freeHeld) : 0;
  const matchedIds = new Set(matched.map((entry) => entry.subjectId));
  return {
    registration: student.registration,
    subjects: matched,
    totals: { held: student.totalHeld, attended: student.totalAttended },
    freeHeld,
    freeAttended,
    unmatchedSubjects: subjects.filter((subject) => !matchedIds.has(subject.id)).map((subject) => ({ id: subject.id, name: subject.name })),
  };
};
