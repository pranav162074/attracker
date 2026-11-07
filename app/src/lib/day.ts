import type { Day, DayClass } from './api.ts';
import { formatDay } from './format.ts';
import { parseIso, toIso } from './dates.ts';
import { WEEKDAY_NAMES } from './grid.ts';

export type Choice = 'present' | 'absent' | 'cancelled';

export const shiftDay = (iso: string, by: number) => {
  const { year, month, day } = parseIso(iso);
  const date = new Date(Date.UTC(year, month, day + by));
  return toIso(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

export const choiceOf = (item: Pick<DayClass, 'status' | 'plannedAbsent'>): Choice => {
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'absent' || item.plannedAbsent) return 'absent';
  return 'present';
};

export const canMark = (day: Pick<Day, 'tracking'>, item: Pick<DayClass, 'cancelledBy'>) => day.tracking && item.cancelledBy !== 'half_day';

export const statusLine = (item: Pick<DayClass, 'status' | 'plannedAbsent' | 'cancelledBy' | 'counts'>) => {
  if (item.cancelledBy === 'half_day') return 'Not held, half day';
  if (item.status === 'cancelled') return 'Cancelled, does not count';
  if (item.plannedAbsent) return 'You plan to miss this';
  if (item.status === 'upcoming') return item.counts ? 'Not started yet, counts as attended once it starts' : 'Not started yet';
  if (!item.counts) return 'Does not count for attendance';
  return item.status === 'absent' ? 'Absent' : 'Present';
};

export const dayTitle = (date: string, today: string) => {
  if (date === today) return `Today, ${formatDay(date)}`;
  if (date === shiftDay(today, -1)) return `Yesterday, ${formatDay(date)}`;
  if (date === shiftDay(today, 1)) return `Tomorrow, ${formatDay(date)}`;
  return formatDay(date);
};

export const dayNotes = (day: Day) => {
  const notes: string[] = [];
  if (day.kind === 'outside') notes.push('This day is outside the semester’s dates.');
  if (day.kind === 'holiday') notes.push(day.label ? `Holiday: ${day.label}. No regular classes.` : 'Holiday. No regular classes.');
  if (day.kind === 'follows_weekday' && day.followsWeekday) notes.push(`Runs ${WEEKDAY_NAMES[day.followsWeekday - 1]}’s timetable${day.label ? ` (${day.label})` : ''}.`);
  if (day.kind === 'half_day') notes.push(day.label ? `Half day: ${day.label}.` : 'Half day.');
  if (!day.tracking) notes.push('Finish setting up this semester and press Start tracking before marking attendance.');
  if (day.classes.some((item) => item.beforeCheckpoint)) {
    notes.push('The official numbers you entered already cover this day, so changes here do not change your percentages.');
  }
  return notes;
};

export const dayTotals = (day: Pick<Day, 'classes'>) => {
  let held = 0;
  let attended = 0;
  for (const item of day.classes) {
    if (!item.counts || item.status === 'cancelled' || item.status === 'upcoming') continue;
    held += item.units;
    if (item.status === 'attended') attended += item.units;
  }
  return { held, attended };
};

export const markFor = (choice: Choice, item: Pick<DayClass, 'subjectId' | 'scheduledSubjectId'>) => ({
  attendance: choice,
  substituteSubjectId: choice === 'cancelled' || item.subjectId === item.scheduledSubjectId ? null : item.subjectId,
});

const pad = (value: number) => String(value).padStart(2, '0');

export const hasStarted = (date: string, start: string, now: Date) => {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (date !== today) return date < today;
  return start <= `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

export const applyMark = (item: DayClass, mark: { attendance: Choice; substituteSubjectId: number | null }, started: boolean): DayClass => {
  if (item.cancelledBy === 'half_day') return item;
  if (mark.attendance === 'cancelled') return { ...item, subjectId: item.scheduledSubjectId, status: 'cancelled', plannedAbsent: false, cancelledBy: 'mark' };
  const subjectId = mark.substituteSubjectId ?? item.scheduledSubjectId;
  if (!started) return { ...item, subjectId, status: 'upcoming', plannedAbsent: mark.attendance === 'absent', cancelledBy: null };
  return { ...item, subjectId, status: mark.attendance === 'absent' ? 'absent' : 'attended', plannedAbsent: false, cancelledBy: null };
};

export const applyPending = (day: Day, pending: Array<{ slotId: number; mark: { attendance: Choice; substituteSubjectId: number | null } }>, now: Date): Day => {
  if (pending.length === 0) return day;
  const bySlot = new Map(pending.map((item) => [item.slotId, item.mark]));
  return {
    ...day,
    classes: day.classes.map((item) => {
      const mark = item.slotId === null ? undefined : bySlot.get(item.slotId);
      return mark ? applyMark(item, mark, hasStarted(day.date, item.start, now)) : item;
    }),
  };
};
