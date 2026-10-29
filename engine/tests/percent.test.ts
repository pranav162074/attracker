import { describe, it, expect } from 'vitest';
import { percentHundredths, formatPercent } from '../src/index.ts';

describe('percentages', () => {
  it('truncates like the college sheet instead of rounding', () => {
    expect(formatPercent(percentHundredths(22, 26))).toBe('84.61');
    expect(formatPercent(percentHundredths(15, 32))).toBe('46.87');
    expect(formatPercent(percentHundredths(10, 21))).toBe('47.61');
    expect(formatPercent(percentHundredths(150, 246))).toBe('60.97');
  });

  it('never shows 75 for anything below 75', () => {
    expect(formatPercent(percentHundredths(2999, 4000))).toBe('74.97');
    expect(formatPercent(percentHundredths(29999, 40000))).toBe('74.99');
    expect(formatPercent(percentHundredths(3, 4))).toBe('75.00');
  });

  it('handles the edges', () => {
    expect(formatPercent(percentHundredths(0, 7))).toBe('0.00');
    expect(formatPercent(percentHundredths(7, 7))).toBe('100.00');
    expect(percentHundredths(0, 0)).toBeNull();
    expect(formatPercent(null)).toBe('-');
  });

  it('refuses impossible counts', () => {
    expect(() => percentHundredths(5, 4)).toThrow(RangeError);
    expect(() => percentHundredths(-1, 4)).toThrow(RangeError);
    expect(() => percentHundredths(1.5, 4)).toThrow(RangeError);
  });
});
