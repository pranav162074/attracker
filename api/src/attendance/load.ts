import type { CalendarRule, Checkpoint, EngineInput, Moment } from '@attracker/engine';
import { query } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';

export type TimetableInfo = {
  id: number;
  startsOn: string;
  endsOn: string | null;
  timeZone: string;
  tracking: boolean;
};

export const nowIn = (timeZone: string, at = new Date()): Moment => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
};

export const ownedTimetable = async (userId: number, timetableId: number): Promise<TimetableInfo & { requiredBp: number | null; condonationBp: number | null }> => {
  const rows = await query<{
    id: number;
    starts_on: string;
    ends_on: string | null;
    time_zone: string;
    tracking: boolean;
    required_bp: number | null;
    condonation_bp: number | null;
  }>(
    `SELECT id, starts_on, ends_on, time_zone, tracking_started_at IS NOT NULL AS tracking, required_bp, condonation_bp
       FROM timetables WHERE id = $1 AND user_id = $2`,
    [timetableId, userId]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'not_found', 'Timetable not found');
  return {
    id: row.id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    timeZone: row.time_zone,
    tracking: row.tracking,
    requiredBp: row.required_bp,
    condonationBp: row.condonation_bp,
  };
};

export const loadEngineInput = async (userId: number, timetableId: number, at = new Date()) => {
  const timetable = await ownedTimetable(userId, timetableId);
  const [subjects, slots, versions, calendar, marks, extras, checkpoints] = await Promise.all([
    query<{ id: number; counts_attendance: boolean; count_per_session: boolean }>(
      'SELECT id, counts_attendance, count_per_session FROM subjects WHERE timetable_id = $1',
      [timetableId]
    ),
    query<{ id: number; version_id: number; weekday: number; start_minute: number; end_minute: number; periods: number; subject_id: number }>(
      'SELECT id, version_id, weekday, start_minute, end_minute, periods, subject_id FROM grid_slots WHERE timetable_id = $1',
      [timetableId]
    ),
    query<{ id: number; effective_from: string }>('SELECT id, effective_from FROM grid_versions WHERE timetable_id = $1 ORDER BY effective_from', [
      timetableId,
    ]),
    query<{ kind: CalendarRule['kind']; starts_on: string; ends_on: string; follows_weekday: number | null; cutoff_minute: number | null; label: string | null }>(
      'SELECT kind, starts_on, ends_on, follows_weekday, cutoff_minute, label FROM calendar_days WHERE timetable_id = $1',
      [timetableId]
    ),
    query<{ slot_id: number; on_date: string; attendance: 'present' | 'absent' | 'cancelled'; substitute_subject_id: number | null }>(
      'SELECT slot_id, on_date, attendance, substitute_subject_id FROM class_marks WHERE timetable_id = $1',
      [timetableId]
    ),
    query<{ id: number; subject_id: number; on_date: string; start_minute: number; end_minute: number; periods: number; attendance: 'present' | 'absent' }>(
      'SELECT id, subject_id, on_date, start_minute, end_minute, periods, attendance FROM extra_classes WHERE timetable_id = $1',
      [timetableId]
    ),
    query<{ id: number; as_of: string; free_held: number; free_attended: number }>(
      'SELECT id, as_of, free_held, free_attended FROM checkpoints WHERE timetable_id = $1 ORDER BY as_of DESC LIMIT 1',
      [timetableId]
    ),
  ]);

  let checkpoint: Checkpoint | null = null;
  const latest = checkpoints[0];
  if (latest) {
    const rows = await query<{ subject_id: number; held: number; attended: number }>(
      'SELECT subject_id, held, attended FROM checkpoint_subjects WHERE checkpoint_id = $1',
      [latest.id]
    );
    checkpoint = {
      asOf: latest.as_of,
      freeHeld: latest.free_held,
      freeAttended: latest.free_attended,
      subjects: rows.map((row) => ({ subjectId: row.subject_id, held: row.held, attended: row.attended })),
    };
  }

  const input: EngineInput = {
    startsOn: timetable.startsOn,
    endsOn: timetable.endsOn,
    requiredBp: timetable.requiredBp,
    condonationBp: timetable.condonationBp,
    subjects: subjects.map((row) => ({ id: row.id, countsAttendance: row.counts_attendance, countPerSession: row.count_per_session })),
    versions: versions.map((version) => ({
      effectiveFrom: version.effective_from,
      slots: slots
        .filter((slot) => slot.version_id === version.id)
        .map((slot) => ({
          id: slot.id,
          weekday: slot.weekday,
          startMinute: slot.start_minute,
          endMinute: slot.end_minute,
          periods: slot.periods,
          subjectId: slot.subject_id,
        })),
    })),
    calendar: calendar.map((row): CalendarRule => {
      if (row.kind === 'holiday') return { kind: 'holiday', startsOn: row.starts_on, endsOn: row.ends_on, label: row.label };
      if (row.kind === 'follows_weekday') return { kind: 'follows_weekday', startsOn: row.starts_on, followsWeekday: row.follows_weekday!, label: row.label };
      return { kind: row.kind, startsOn: row.starts_on, cutoffMinute: row.cutoff_minute!, label: row.label };
    }),
    marks: marks.map((row) => ({ slotId: row.slot_id, onDate: row.on_date, attendance: row.attendance, substituteSubjectId: row.substitute_subject_id })),
    extras: extras.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      onDate: row.on_date,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      periods: row.periods,
      attendance: row.attendance,
    })),
    checkpoint,
    now: nowIn(timetable.timeZone, at),
  };
  return { timetable, input };
};
