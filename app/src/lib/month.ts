import type { DayOverview } from './api.ts';
import { MONTHS, monthGrid, parseIso, shiftMonth } from './dates.ts';
import { WEEKDAY_SHORT } from './grid.ts';

export type MonthKey = { year: number; month: number };

export const monthKeyOf = (iso: string): MonthKey => {
  const { year, month } = parseIso(iso);
  return { year, month };
};

export const parseMonthParam = (value: string | undefined, fallback: string): MonthKey => {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (match) {
    const month = Number(match[2]) - 1;
    if (month >= 0 && month <= 11) return { year: Number(match[1]), month };
  }
  return monthKeyOf(fallback);
};

export const monthParam = ({ year, month }: MonthKey) => `${year}-${String(month + 1).padStart(2, '0')}`;

export const monthTitle = ({ year, month }: MonthKey) => `${MONTHS[month]} ${year}`;

export const neighbour = (key: MonthKey, by: number) => shiftMonth(key.year, key.month, by);

export const gridRange = (key: MonthKey) => {
  const weeks = monthGrid(key.year, key.month);
  return { weeks, from: weeks[0]![0]!.iso, to: weeks.at(-1)!.at(-1)!.iso };
};

export type CellLook = 'outside' | 'holiday' | 'absent' | 'present' | 'cancelled' | 'upcoming' | 'empty';

export const cellLook = (day: DayOverview | undefined): CellLook => {
  if (!day || day.kind === 'outside') return 'outside';
  if (day.kind === 'holiday' && day.classes === 0) return 'holiday';
  if (day.absent > 0 || day.plannedAbsent > 0) return 'absent';
  if (day.held > 0) return 'present';
  if (day.classes > 0 && day.cancelled === day.classes) return 'cancelled';
  if (day.upcoming > 0) return 'upcoming';
  return 'empty';
};

export const cellNote = (day: DayOverview | undefined) => {
  if (!day || day.kind === 'outside') return null;
  if (day.kind === 'holiday' && day.classes === 0) return 'Holiday';
  if (day.absent > 0) return `−${day.absent}`;
  if (day.plannedAbsent > 0) return 'Skip';
  if (day.kind === 'follows_weekday' && day.followsWeekday) return WEEKDAY_SHORT[day.followsWeekday - 1]!;
  if (day.kind === 'half_day') return 'Half';
  if (day.classes > 0 && day.cancelled === day.classes) return 'Off';
  return null;
};

export const monthTotals = (days: DayOverview[], key: MonthKey) => {
  const prefix = monthParam(key);
  let held = 0;
  let attended = 0;
  let absentDays = 0;
  let holidays = 0;
  for (const day of days) {
    if (!day.date.startsWith(prefix)) continue;
    held += day.held;
    attended += day.attended;
    if (day.absent > 0) absentDays += 1;
    if (day.kind === 'holiday') holidays += 1;
  }
  return { held, attended, absentDays, holidays };
};
