import { dayPlan } from '@attracker/engine';
import type { DayPlan } from '@attracker/engine';
import { query } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import { toClock, toMinutes } from '../grid/time.ts';
import { loadEngineInput } from './load.ts';

export const MAX_EXTRAS_PER_DAY = 20;

const toDayResponse = (plan: DayPlan, tracking: boolean) => ({
  date: plan.date,
  kind: plan.kind,
  label: plan.label,
  followsWeekday: plan.followsWeekday,
  tracking,
  classes: plan.occurrences.map((occurrence) => ({
    key: occurrence.key,
    slotId: occurrence.slotId,
    extraId: occurrence.extraId,
    subjectId: occurrence.subjectId,
    scheduledSubjectId: occurrence.scheduledSubjectId,
    start: toClock(occurrence.startMinute),
    end: toClock(occurrence.endMinute),
    units: occurrence.units,
    counts: occurrence.counts,
    status: occurrence.status,
    plannedAbsent: occurrence.plannedAbsent,
    cancelledBy: occurrence.cancelledBy,
    beforeCheckpoint: occurrence.beforeCheckpoint,
  })),
});

export const getDay = async (userId: number, timetableId: number, date: string) => {
  const { timetable, input } = await loadEngineInput(userId, timetableId);
  return toDayResponse(dayPlan(input, date), timetable.tracking);
};

const requireTracking = (tracking: boolean) => {
  if (!tracking) throw new HttpError(409, 'not_tracking', 'Press Start Tracking before marking attendance');
};

const requireActiveSubject = async (timetableId: number, subjectId: number, role: string) => {
  const rows = await query<{ archived: boolean; name: string }>(
    'SELECT archived_at IS NOT NULL AS archived, name FROM subjects WHERE id = $1 AND timetable_id = $2',
    [subjectId, timetableId]
  );
  if (!rows[0]) throw new HttpError(400, 'validation_error', `${role} is not part of this timetable`);
  if (rows[0].archived) throw new HttpError(400, 'validation_error', `${rows[0].name} is archived`);
};

export type MarkInput = { attendance: 'present' | 'absent' | 'cancelled'; substituteSubjectId: number | null };

export const setMark = async (userId: number, timetableId: number, date: string, slotId: number, mark: MarkInput) => {
  const { timetable, input } = await loadEngineInput(userId, timetableId);
  requireTracking(timetable.tracking);
  const plan = dayPlan(input, date);
  const occurrence = plan.occurrences.find((item) => item.slotId === slotId);
  if (!occurrence) throw new HttpError(409, 'no_such_class', 'There is no such class on this day');

  const substitute = mark.substituteSubjectId === occurrence.scheduledSubjectId ? null : mark.substituteSubjectId;
  if (substitute !== null) {
    if (mark.attendance === 'cancelled') throw new HttpError(400, 'validation_error', 'A cancelled class cannot have a substitute subject');
    await requireActiveSubject(timetableId, substitute, 'The substitute subject');
  }

  if (mark.attendance === 'present' && substitute === null) {
    await query('DELETE FROM class_marks WHERE slot_id = $1 AND on_date = $2 AND timetable_id = $3', [slotId, date, timetableId]);
  } else {
    await query(
      `INSERT INTO class_marks (timetable_id, slot_id, on_date, attendance, substitute_subject_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slot_id, on_date) DO UPDATE
         SET attendance = EXCLUDED.attendance, substitute_subject_id = EXCLUDED.substitute_subject_id, updated_at = now()`,
      [timetableId, slotId, date, mark.attendance, substitute]
    );
  }
  return getDay(userId, timetableId, date);
};

export const clearMark = async (userId: number, timetableId: number, date: string, slotId: number) => {
  const { timetable } = await loadEngineInput(userId, timetableId);
  requireTracking(timetable.tracking);
  await query('DELETE FROM class_marks WHERE slot_id = $1 AND on_date = $2 AND timetable_id = $3', [slotId, date, timetableId]);
  return getDay(userId, timetableId, date);
};

export type ExtraInput = { subjectId: number; start: string; end: string; periods: number; attendance: 'present' | 'absent' };

export const addExtra = async (userId: number, timetableId: number, date: string, extra: ExtraInput) => {
  const { timetable, input } = await loadEngineInput(userId, timetableId);
  requireTracking(timetable.tracking);
  if (date < input.startsOn || (input.endsOn !== null && date > input.endsOn)) {
    throw new HttpError(400, 'validation_error', 'Extra classes must be within the timetable’s dates');
  }
  await requireActiveSubject(timetableId, extra.subjectId, 'The subject');
  const sameDay = input.extras.filter((item) => item.onDate === date).length;
  if (sameDay >= MAX_EXTRAS_PER_DAY) throw new HttpError(409, 'too_many_extras', `A day can have up to ${MAX_EXTRAS_PER_DAY} extra classes`);
  await query(
    `INSERT INTO extra_classes (timetable_id, subject_id, on_date, start_minute, end_minute, periods, attendance)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [timetableId, extra.subjectId, date, toMinutes(extra.start), toMinutes(extra.end), extra.periods, extra.attendance]
  );
  return getDay(userId, timetableId, date);
};

const findExtra = async (timetableId: number, extraId: number) => {
  const rows = await query<{ on_date: string; subject_id: number; start_minute: number; end_minute: number; periods: number; attendance: 'present' | 'absent' }>(
    'SELECT on_date, subject_id, start_minute, end_minute, periods, attendance FROM extra_classes WHERE id = $1 AND timetable_id = $2',
    [extraId, timetableId]
  );
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Extra class not found');
  return rows[0];
};

export const updateExtra = async (userId: number, timetableId: number, extraId: number, changes: Partial<ExtraInput>) => {
  const { timetable } = await loadEngineInput(userId, timetableId);
  requireTracking(timetable.tracking);
  const current = await findExtra(timetableId, extraId);
  if (changes.subjectId !== undefined) await requireActiveSubject(timetableId, changes.subjectId, 'The subject');
  const start = changes.start !== undefined ? toMinutes(changes.start)! : current.start_minute;
  const end = changes.end !== undefined ? toMinutes(changes.end)! : current.end_minute;
  if (end <= start) throw new HttpError(400, 'validation_error', 'end must be after start');
  await query(
    'UPDATE extra_classes SET subject_id = $3, start_minute = $4, end_minute = $5, periods = $6, attendance = $7 WHERE id = $1 AND timetable_id = $2',
    [extraId, timetableId, changes.subjectId ?? current.subject_id, start, end, changes.periods ?? current.periods, changes.attendance ?? current.attendance]
  );
  return getDay(userId, timetableId, current.on_date);
};

export const deleteExtra = async (userId: number, timetableId: number, extraId: number) => {
  const { timetable } = await loadEngineInput(userId, timetableId);
  requireTracking(timetable.tracking);
  const current = await findExtra(timetableId, extraId);
  await query('DELETE FROM extra_classes WHERE id = $1 AND timetable_id = $2', [extraId, timetableId]);
  return getDay(userId, timetableId, current.on_date);
};
