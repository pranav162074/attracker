import { describe, it, expect } from 'vitest';
import { formatDate, friendlyDates, isRealIso, monthGrid, shiftMonth, toIso } from '../src/lib/dates.ts';

describe('the date picker', () => {
  it('lays out a month in weeks starting on Monday', () => {
    const july = monthGrid(2026, 6);
    expect(july).toHaveLength(5);
    expect(july[0]!.map((cell) => cell.day)).toEqual([29, 30, 1, 2, 3, 4, 5]);
    expect(july[0]![0]).toEqual({ iso: '2026-06-29', day: 29, inMonth: false });
    expect(july[0]![2]).toEqual({ iso: '2026-07-01', day: 1, inMonth: true });
    expect(july[3]![0]!.iso).toBe('2026-07-20');
    expect(july[4]!.at(-1)).toEqual({ iso: '2026-08-02', day: 2, inMonth: false });
  });

  it('handles a month that starts on Monday and a month that needs six rows', () => {
    const june = monthGrid(2026, 5);
    expect(june[0]![0]).toEqual({ iso: '2026-06-01', day: 1, inMonth: true });
    expect(june.flat().filter((cell) => cell.inMonth)).toHaveLength(30);
    const november = monthGrid(2026, 10);
    expect(november).toHaveLength(6);
    expect(november[0]!.at(-1)!.iso).toBe('2026-11-01');
    expect(november[5]![0]!.iso).toBe('2026-11-30');
  });

  it('knows leap years', () => {
    expect(monthGrid(2028, 1).flat().filter((cell) => cell.inMonth)).toHaveLength(29);
    expect(monthGrid(2027, 1).flat().filter((cell) => cell.inMonth)).toHaveLength(28);
  });

  it('moves between months across years', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
  });

  it('writes and checks dates', () => {
    expect(toIso(2026, 6, 20)).toBe('2026-07-20');
    expect(formatDate('2026-07-20')).toBe('20 Jul 2026');
    expect(isRealIso('2026-02-29')).toBe(false);
    expect(isRealIso('2028-02-29')).toBe(true);
    expect(isRealIso('2026-7-20')).toBe(false);
  });
});

describe('dates inside server messages', () => {
  it('rewrites ISO dates the way the app shows them', () => {
    expect(friendlyDates('2026-08-15 is already a holiday (Independence Day)')).toBe('15 Aug 2026 is already a holiday (Independence Day)');
    expect(friendlyDates('Days must be between 2026-07-20 and 2026-11-14')).toBe('Days must be between 20 Jul 2026 and 14 Nov 2026');
    expect(friendlyDates('No dates here, and 2026-02-30 is not real')).toBe('No dates here, and 2026-02-30 is not real');
  });
});
