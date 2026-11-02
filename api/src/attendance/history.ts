import { dayPlan } from '@attracker/engine';
import { query } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import { toClock } from '../grid/time.ts';
import { loadEngineInput } from './load.ts';

const MAX_DAYS = 400;

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export type HistoryEvent = {
  date: string;
  start: string;
  end: string;
  units: number;
  kind: 'absent' | 'planned_absent' | 'cancelled' | 'extra' | 'took_over' | 'taken_by_other';
  otherSubjectId: number | null;
  beforeCheckpoint: boolean;
};

export const subjectHistory = async (userId: number, timetableId: number, subjectId: number) => {
  const { input } = await loadEngineInput(userId, timetableId);
  const found = await query('SELECT 1 FROM subjects WHERE id = $1 AND timetable_id = $2', [subjectId, timetableId]);
  if (found.length === 0) throw new HttpError(404, 'not_found', 'Subject not found');

  const last = input.endsOn ?? addDays(input.now.date, 60);
  const events: HistoryEvent[] = [];
  let date = input.startsOn;
  for (let count = 0; date <= last && count < MAX_DAYS; count += 1, date = addDays(date, 1)) {
    for (const occurrence of dayPlan(input, date).occurrences) {
      const mine = occurrence.subjectId === subjectId;
      const scheduledMine = occurrence.scheduledSubjectId === subjectId;
      if (!mine && !scheduledMine) continue;
      const base = {
        date,
        start: toClock(occurrence.startMinute),
        end: toClock(occurrence.endMinute),
        units: occurrence.units,
        beforeCheckpoint: occurrence.beforeCheckpoint,
      };
      if (!mine && scheduledMine) {
        events.push({ ...base, kind: 'taken_by_other', otherSubjectId: occurrence.subjectId });
        continue;
      }
      const swappedIn = occurrence.slotId !== null && !scheduledMine;
      if (occurrence.status === 'cancelled' && occurrence.cancelledBy === 'mark') events.push({ ...base, kind: 'cancelled', otherSubjectId: null });
      else if (occurrence.status === 'absent') events.push({ ...base, kind: 'absent', otherSubjectId: swappedIn ? occurrence.scheduledSubjectId : null });
      else if (occurrence.plannedAbsent) events.push({ ...base, kind: 'planned_absent', otherSubjectId: swappedIn ? occurrence.scheduledSubjectId : null });
      else if (occurrence.extraId !== null) events.push({ ...base, kind: 'extra', otherSubjectId: null });
      else if (swappedIn) events.push({ ...base, kind: 'took_over', otherSubjectId: occurrence.scheduledSubjectId });
    }
  }
  return { checkpoint: input.checkpoint ? { asOf: input.checkpoint.asOf } : null, events };
};
