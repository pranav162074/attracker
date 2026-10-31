import { describe, it, expect } from 'vitest';
import { parseHolidays } from '../src/index.ts';

const GVPCE_TWO_COLUMNS = `Holidays
15.08.2026 (Saturday): Independence Day 14.09.2026 (Monday): Vinayaka Chavithi
21.08.2026 (Friday): Vara Lakshmi Vratham 02.10.2026 (Friday): Mahatma Gandhi Jayanthi
25.08.2026 (Tuesday): Milad-Un-Nabi 20.10.2026 (Tuesday): Vijaya Dasami
04.09.2026 (Friday): Sri Krishnaashtami`;

describe('reading holidays pasted from an academic calendar', () => {
  it('reads the GVPCE Sem V list, even with two holidays on one line', () => {
    const { holidays, skipped } = parseHolidays(GVPCE_TWO_COLUMNS);
    expect(holidays.map((h) => [h.startsOn, h.label])).toEqual([
      ['2026-08-15', 'Independence Day'],
      ['2026-08-21', 'Vara Lakshmi Vratham'],
      ['2026-08-25', 'Milad-Un-Nabi'],
      ['2026-09-04', 'Sri Krishnaashtami'],
      ['2026-09-14', 'Vinayaka Chavithi'],
      ['2026-10-02', 'Mahatma Gandhi Jayanthi'],
      ['2026-10-20', 'Vijaya Dasami'],
    ]);
    expect(holidays.every((h) => h.endsOn === h.startsOn && h.warnings.length === 0)).toBe(true);
    expect(skipped).toEqual([{ line: 1, text: 'Holidays', reason: 'No date found' }]);
  });

  it('understands ranges and the common date styles', () => {
    const { holidays } = parseHolidays(
      [
        '07.09.2026 - 12.09.2026 Mid exams',
        '16/11/2026 to 21/11/2026: Practical examinations',
        '2026-12-25 Christmas',
        '1-1-27 New Year',
        'Pongal 14.01.2027 – 16.01.2027',
      ].join('\n')
    );
    expect(holidays.map((h) => [h.startsOn, h.endsOn, h.label])).toEqual([
      ['2026-09-07', '2026-09-12', 'Mid exams'],
      ['2026-11-16', '2026-11-21', 'Practical examinations'],
      ['2026-12-25', '2026-12-25', 'Christmas'],
      ['2027-01-01', '2027-01-01', 'New Year'],
      ['2027-01-14', '2027-01-16', 'Pongal'],
    ]);
  });

  it('warns when the weekday written next to a date does not match it', () => {
    const { holidays } = parseHolidays('15.08.2026 (Friday): Independence Day');
    expect(holidays[0]!.warnings).toEqual(['2026-08-15 is a Saturday, but the text says Friday']);
  });

  it('skips impossible dates and backwards ranges, saying why', () => {
    const { holidays, skipped } = parseHolidays('31.02.2026 Not a day\n12.09.2026 - 07.09.2026 Backwards\n\n   \nNo date here');
    expect(holidays).toEqual([]);
    expect(skipped).toEqual([
      { line: 1, text: '31.02.2026 Not a day', reason: 'Not a real date' },
      { line: 2, text: '12.09.2026 - 07.09.2026 Backwards', reason: 'The range ends before it starts' },
      { line: 5, text: 'No date here', reason: 'No date found' },
    ]);
  });

  it('keeps labels short and tidy', () => {
    const { holidays } = parseHolidays(`02.10.2026 (Fri.) :  Gandhi   Jayanthi ;\n03.10.2026 ${'x'.repeat(200)}`);
    expect(holidays[0]!.label).toBe('Gandhi Jayanthi');
    expect(holidays[1]!.label).toHaveLength(80);
  });
});
