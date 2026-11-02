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
  if (day.kind === 'outside') notes.push('This day is outside the timetable’s dates.');
  if (day.kind === 'holiday') notes.push(day.label ? `Holiday: ${day.label}. No regular classes.` : 'Holiday. No regular classes.');
  if (day.kind === 'follows_weekday' && day.followsWeekday) notes.push(`Runs ${WEEKDAY_NAMES[day.followsWeekday - 1]}’s timetable${day.label ? ` (${day.label})` : ''}.`);
  if (day.kind === 'half_day') notes.push(day.label ? `Half day: ${day.label}.` : 'Half day.');
  if (!day.tracking) notes.push('Press Start Tracking on the timetable before marking attendance.');
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
