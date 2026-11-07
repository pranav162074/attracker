import { describe, it, expect } from 'vitest';
import { abbreviate, slotAt, weekRows } from '../src/lib/weekView.ts';

describe('the week at a glance', () => {
  it('shortens long subject names for the small grid', () => {
    expect(abbreviate('Data Warehousing and Data Mining')).toBe('DWDM');
    expect(abbreviate('Computer Networks Lab')).toBe('CNL');
    expect(abbreviate('Maths')).toBe('Maths');
    expect(abbreviate('Constitution of India', 'COI')).toBe('COI');
    expect(abbreviate('Counselling')).toBe('Counsel');
  });

  it('lines classes up by start time across the visible days', () => {
    const draft = [
      { weekday: 1, start: 520 },
      { weekday: 2, start: 520 },
      { weekday: 1, start: 570 },
      { weekday: 6, start: 480 },
    ];
    expect(weekRows(draft, [1, 2, 3, 4, 5])).toEqual([520, 570]);
    expect(weekRows(draft, [1, 2, 3, 4, 5, 6, 7])).toEqual([480, 520, 570]);
    expect(slotAt(draft, 2, 520)).toEqual({ weekday: 2, start: 520 });
    expect(slotAt(draft, 3, 520)).toBeNull();
  });
});
