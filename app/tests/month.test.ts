import { describe, it, expect } from 'vitest';
import type { DayOverview } from '../src/lib/api.ts';
import { cellLook, cellNote, gridRange, monthParam, monthTitle, monthTotals, neighbour, parseMonthParam } from '../src/lib/month.ts';

const day = (values: Partial<DayOverview>): DayOverview => ({
  date: '2026-11-02',
  kind: 'normal',
  label: null,
  followsWeekday: null,
  classes: 5,
  held: 6,
  attended: 6,
  absent: 0,
  cancelled: 0,
  upcoming: 0,
  plannedAbsent: 0,
  extra: 0,
  swapped: 0,
  ...values,
});

describe('choosing the month', () => {
  it('reads the month from the address, or falls back to today', () => {
    expect(parseMonthParam('2026-08', '2026-11-03')).toEqual({ year: 2026, month: 7 });
    expect(parseMonthParam(undefined, '2026-11-03')).toEqual({ year: 2026, month: 10 });
    expect(parseMonthParam('2026-13', '2026-11-03')).toEqual({ year: 2026, month: 10 });
    expect(parseMonthParam('August', '2026-11-03')).toEqual({ year: 2026, month: 10 });
  });

  it('names months and moves between them', () => {
    expect(monthParam({ year: 2026, month: 7 })).toBe('2026-08');
    expect(monthTitle({ year: 2026, month: 7 })).toBe('August 2026');
    expect(neighbour({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('asks the API for whole weeks around the month, within its 62-day limit', () => {
    expect(gridRange({ year: 2026, month: 10 })).toMatchObject({ from: '2026-10-26', to: '2026-12-06' });
    expect(gridRange({ year: 2026, month: 7 })).toMatchObject({ from: '2026-07-27', to: '2026-09-06' });
  });
});

describe('each day in the month', () => {
  it('looks attended, missed, off or empty', () => {
    expect(cellLook(day({}))).toBe('present');
    expect(cellLook(day({ attended: 3, absent: 3 }))).toBe('absent');
    expect(cellLook(day({ held: 0, attended: 0, upcoming: 5, plannedAbsent: 1 }))).toBe('absent');
    expect(cellLook(day({ kind: 'holiday', classes: 0, held: 0, attended: 0 }))).toBe('holiday');
    expect(cellLook(day({ kind: 'holiday', classes: 1, held: 1, attended: 1, extra: 1 }))).toBe('present');
    expect(cellLook(day({ classes: 2, held: 0, attended: 0, cancelled: 2 }))).toBe('cancelled');
    expect(cellLook(day({ held: 0, attended: 0, upcoming: 5 }))).toBe('upcoming');
    expect(cellLook(day({ classes: 0, held: 0, attended: 0 }))).toBe('empty');
    expect(cellLook(day({ kind: 'outside' }))).toBe('outside');
    expect(cellLook(undefined)).toBe('outside');
  });

  it('notes what happened in a word', () => {
    expect(cellNote(day({ attended: 3, absent: 3 }))).toBe('−3');
    expect(cellNote(day({ kind: 'holiday', classes: 0 }))).toBe('Holiday');
    expect(cellNote(day({ kind: 'follows_weekday', followsWeekday: 1 }))).toBe('Mon');
    expect(cellNote(day({ kind: 'half_day' }))).toBe('Half');
    expect(cellNote(day({ held: 0, upcoming: 5, plannedAbsent: 1 }))).toBe('Skip');
    expect(cellNote(day({ classes: 2, held: 0, cancelled: 2 }))).toBe('Off');
    expect(cellNote(day({}))).toBeNull();
    expect(cellNote(day({ kind: 'outside' }))).toBeNull();
  });

  it('adds up only the days inside the month', () => {
    const days = [
      day({ date: '2026-10-30', held: 6, attended: 6 }),
      day({ date: '2026-11-02', held: 6, attended: 3, absent: 3 }),
      day({ date: '2026-11-03', held: 5, attended: 5 }),
      day({ date: '2026-11-04', kind: 'holiday', classes: 0, held: 0, attended: 0 }),
      day({ date: '2026-12-01', held: 6, attended: 0, absent: 6 }),
    ];
    expect(monthTotals(days, { year: 2026, month: 10 })).toEqual({ held: 11, attended: 8, absentDays: 1, holidays: 1 });
  });
});
