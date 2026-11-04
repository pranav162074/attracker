import { describe, it, expect } from 'vitest';
import { canCount, catchUpKey, catchUpText, classDays, findCatchUp, officialDetail, spanDays } from '../src/lib/catchUp.ts';

const semester = { startsOn: '2026-07-20', endsOn: '2026-11-18' };

describe('days nobody has checked', () => {
  it('finds the days between the official numbers and the day tracking started', () => {
    const found = findCatchUp({ ...semester, trackingStartedOn: '2026-09-07' }, '2026-08-31');
    expect(found).toEqual({ kind: 'gap', from: '2026-09-01', to: '2026-09-06', startsOn: '2026-07-20', startedOn: '2026-09-07', asOf: '2026-08-31' });
    expect(spanDays(found!)).toBe(6);
    expect(catchUpKey(found!)).toBe('2026-09-01:2026-09-06');
  });

  it('has nothing to check when the sheet runs up to the day before starting, or later', () => {
    expect(findCatchUp({ ...semester, trackingStartedOn: '2026-09-01' }, '2026-08-31')).toBeNull();
    expect(findCatchUp({ ...semester, trackingStartedOn: '2026-09-07' }, '2026-10-15')).toBeNull();
  });

  it('notices someone who started weeks into the semester with no official numbers', () => {
    expect(findCatchUp({ ...semester, trackingStartedOn: '2026-09-07' }, null)).toMatchObject({ kind: 'late', from: '2026-07-20', to: '2026-09-06' });
  });

  it('stays quiet for someone who started on the first day, or has not started', () => {
    expect(findCatchUp({ ...semester, trackingStartedOn: '2026-07-20' }, null)).toBeNull();
    expect(findCatchUp({ ...semester, trackingStartedOn: '2026-07-10' }, null)).toBeNull();
    expect(findCatchUp({ ...semester, trackingStartedOn: null }, null)).toBeNull();
  });

  it('stops at the end of the semester', () => {
    expect(findCatchUp({ ...semester, trackingStartedOn: '2026-12-01' }, '2026-11-10')).toMatchObject({ from: '2026-11-11', to: '2026-11-18' });
  });

  it('only counts class days over short spans, and ignores days without classes', () => {
    expect(canCount({ from: '2026-09-01', to: '2026-10-31' })).toBe(true);
    expect(canCount({ from: '2026-07-20', to: '2026-09-30' })).toBe(false);
    expect(classDays([{ classes: 5 }, { classes: 0 }, { classes: 2 }])).toBe(2);
  });
});

describe('what the timetable page says', () => {
  it('asks to check the days after the sheet', () => {
    const found = findCatchUp({ ...semester, trackingStartedOn: '2026-09-07' }, '2026-08-31')!;
    expect(catchUpText(found, 5)).toEqual({
      title: 'Check 1 Sep 2026 to 6 Sep 2026',
      body: 'The official numbers go up to 31 Aug 2026 and you started using attracker on 7 Sep 2026. 5 days in between have classes. Those classes count as attended until you mark them, so mark any you missed.',
    });
    expect(catchUpText({ ...found, to: '2026-09-01' }, 1).title).toBe('Check 1 Sep 2026');
    expect(catchUpText(found, 1).body).toContain('1 day in between has classes.');
    expect(catchUpText(found, null).body).not.toContain('in between');
  });

  it('suggests official numbers to someone who started late', () => {
    const found = findCatchUp({ ...semester, trackingStartedOn: '2026-09-07' }, null)!;
    const text = catchUpText(found, null);
    expect(text.title).toBe('Classes before 7 Sep 2026');
    expect(text.body).toContain('The semester began on 20 Jul 2026');
  });

  it('describes the official numbers row', () => {
    expect(officialDetail(null)).toBe('Started partway through? Enter the latest attendance the college gave you.');
    expect(officialDetail('2026-08-31')).toBe('Using the college’s numbers up to 31 Aug 2026. Add a newer sheet when you get one.');
  });
});
