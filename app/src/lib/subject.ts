import type { GridSlot, HistoryEvent, SubjectTally } from './api.ts';
import { formatDate } from './dates.ts';
import { classes } from './format.ts';
import { clockToMinutes, showTime, WEEKDAY_SHORT } from './grid.ts';

export const eventText = (event: HistoryEvent, otherName: string | null) => {
  const periods = event.units > 1 ? `, ${event.units} periods` : '';
  const other = otherName ?? 'another subject';
  switch (event.kind) {
    case 'absent':
      return event.otherSubjectId ? `Absent, in ${other}’s period${periods}` : `Absent${periods}`;
    case 'planned_absent':
      return `You plan to miss this${periods}`;
    case 'cancelled':
      return 'Cancelled, not counted';
    case 'extra':
      return `Extra class${periods}`;
    case 'took_over':
      return `Taught in ${other}’s period${periods}`;
    case 'taken_by_other':
      return `Period taken by ${other}, not counted here`;
  }
};

export const eventTone = (event: HistoryEvent) => {
  if (event.kind === 'absent') return 'bad' as const;
  if (event.kind === 'planned_absent') return 'warn' as const;
  if (event.kind === 'extra' || event.kind === 'took_over') return 'good' as const;
  return 'neutral' as const;
};

export const eventWhen = (event: Pick<HistoryEvent, 'date' | 'start'>) => `${formatDate(event.date)}, ${showTime(clockToMinutes(event.start))}`;

export const splitHistory = (events: HistoryEvent[], today: string) => ({
  coming: events.filter((event) => event.date > today || event.kind === 'planned_absent').sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1)),
  past: events.filter((event) => event.date <= today && event.kind !== 'planned_absent').sort((a, b) => (a.date + a.start > b.date + b.start ? -1 : 1)),
});

export const missedTotal = (events: HistoryEvent[]) => events.filter((event) => event.kind === 'absent').reduce((sum, event) => sum + event.units, 0);

export const weeklySlots = (slots: GridSlot[], subjectId: number) =>
  slots
    .filter((slot) => slot.subjectId === subjectId)
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
    .map((slot) => `${WEEKDAY_SHORT[slot.weekday - 1]} ${showTime(clockToMinutes(slot.start))} to ${showTime(clockToMinutes(slot.end))}${slot.periods > 1 ? `, ${slot.periods} periods` : ''}`);

export const weeklyLoad = (slots: GridSlot[], subjectId: number, countPerSession: boolean) => {
  const mine = slots.filter((slot) => slot.subjectId === subjectId);
  const units = mine.reduce((sum, slot) => sum + (countPerSession ? 1 : slot.periods), 0);
  if (mine.length === 0) return 'Not in the weekly timetable';
  return countPerSession || units === mine.length ? `${classes(units)} a week` : `${units} periods a week, in ${classes(mine.length)}`;
};

export const subjectOutlook = (row: Pick<SubjectTally, 'remaining' | 'bestText' | 'unitsPerClass'>) => {
  if (row.remaining === null) return null;
  if (row.remaining === 0) return 'No classes of this subject are left this term.';
  const left = row.unitsPerClass > 1 ? `${row.remaining} periods` : classes(row.remaining);
  return `${left} left this term. Attending all of them takes this subject to ${row.bestText}%.`;
};
