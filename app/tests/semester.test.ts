import { describe, it, expect } from 'vitest';
import type { Line } from '../src/lib/api.ts';
import { blockedBy, byAttention, datesDetail, neighbourStep, nextClassDay, noClassesText, parseSaved, pickSemester, resumeStep, setupPath, shortLine, stepNumber, uncheckedDay, uncheckedText } from '../src/lib/semester.ts';

const day = (date: string, values: Partial<{ kind: 'normal' | 'holiday' | 'outside' | 'half_day' | 'follows_weekday'; classes: number; absent: number; swapped: number; extra: number }> = {}) => ({
  date,
  kind: 'normal' as const,
  classes: 5,
  absent: 0,
  swapped: 0,
  extra: 0,
  ...values,
});

const line = (values: Partial<Line>): Line => ({ name: 'required', percent: 75, met: true, canMiss: 0, need: null, reachable: true, ...values }) as Line;

describe('choosing the semester to show', () => {
  const list = [
    { timetableId: 4, status: 'setup' as const },
    { timetableId: 7, status: 'tracking' as const },
    { timetableId: 9, status: 'tracking' as const },
  ];

  it('keeps the one picked before, else the first one being tracked, else the first', () => {
    expect(pickSemester(list, 9)).toBe(9);
    expect(pickSemester(list, 99)).toBe(7);
    expect(pickSemester(list, null)).toBe(7);
    expect(pickSemester([{ timetableId: 4, status: 'setup' }], null)).toBe(4);
    expect(pickSemester([], 3)).toBeNull();
  });

  it('reads the saved choice safely', () => {
    expect(parseSaved('12')).toBe(12);
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved('nope')).toBeNull();
    expect(parseSaved('-3')).toBeNull();
  });
});

describe('setting up a semester step by step', () => {
  const steps = (done: Record<string, boolean>) => ['dates', 'subjects', 'grid', 'holidays', 'official'].map((key) => ({ key: key as 'dates', done: done[key] ?? false }));

  it('carries on from the first unfinished step', () => {
    expect(resumeStep(steps({ dates: true }))).toBe('subjects');
    expect(resumeStep(steps({ dates: true, subjects: true }))).toBe('grid');
    expect(resumeStep(steps({ dates: true, subjects: true, grid: true }))).toBe('started');
  });

  it('numbers the steps and links them', () => {
    expect(stepNumber('details')).toBe(1);
    expect(stepNumber('started')).toBe(5);
    expect(neighbourStep('subjects', 1)).toBe('grid');
    expect(neighbourStep('subjects', -1)).toBe('details');
    expect(neighbourStep('details', -1)).toBeNull();
    expect(setupPath(3, 'grid')).toBe('/timetables/3/grid?setup=1');
    expect(setupPath(3, 'started')).toBe('/timetables/3/started');
  });

  it('only lets you move on once the required parts are there', () => {
    expect(blockedBy('subjects', steps({ dates: true }))).toBe('Add at least one subject that counts for attendance first.');
    expect(blockedBy('subjects', steps({ subjects: true }))).toBeNull();
    expect(blockedBy('grid', steps({ subjects: true }))).toBe('Add at least one class to the weekly timetable first.');
    expect(blockedBy('calendar', steps({}))).toBeNull();
  });
});

describe('asking about the last class day', () => {
  const week = [day('2026-11-02'), day('2026-11-03'), day('2026-11-04', { classes: 0 }), day('2026-11-05'), day('2026-11-06')];

  it('asks about the last day with classes that nobody has looked at', () => {
    expect(uncheckedDay(week, '2026-10-01', null)).toEqual({ date: '2026-11-06', classes: 5 });
    expect(uncheckedDay(week, '2026-10-01', '2026-11-06')).toBeNull();
    expect(uncheckedDay(week, '2026-10-01', '2026-11-05')).toEqual({ date: '2026-11-06', classes: 5 });
  });

  it('skips holidays and days already marked', () => {
    expect(uncheckedDay([day('2026-11-05'), day('2026-11-06', { kind: 'holiday', classes: 0 })], '2026-10-01', null)).toEqual({ date: '2026-11-05', classes: 5 });
    expect(uncheckedDay([day('2026-11-06', { absent: 1 })], '2026-10-01', null)).toBeNull();
  });

  it('never asks about days before tracking started', () => {
    expect(uncheckedDay(week, '2026-11-07', null)).toBeNull();
    expect(uncheckedDay(week, '2026-11-06', null)).toEqual({ date: '2026-11-06', classes: 5 });
    expect(uncheckedDay(week, null, null)).toBeNull();
  });

  it('says which day', () => {
    expect(uncheckedText({ date: '2026-11-06', classes: 5 }, '2026-11-07')).toBe('Yesterday had 5 classes. Did you miss any?');
    expect(uncheckedText({ date: '2026-11-05', classes: 1 }, '2026-11-07')).toBe('Thursday, 5 Nov 2026, had 1 class. Did you miss any?');
  });
});

describe('days without classes', () => {
  it('finds the next class day and says why there is nothing today', () => {
    expect(nextClassDay([day('2026-11-10', { kind: 'holiday', classes: 0 }), day('2026-11-11')])).toBe('2026-11-11');
    expect(nextClassDay([day('2026-11-10', { classes: 0 })])).toBeNull();
    expect(noClassesText('holiday', 'Diwali', '2026-11-11')).toBe('Diwali, a holiday. Next classes: Wednesday, 11 Nov 2026.');
    expect(noClassesText('normal', null, null)).toBe('Nothing on the timetable today.');
    expect(noClassesText('outside', null, null)).toBe('Outside the semester’s dates.');
  });
});

describe('subjects at a glance', () => {
  it('says briefly what each subject needs', () => {
    expect(shortLine(line({ canMiss: 1 }))).toBe('Can miss 1 class');
    expect(shortLine(line({ canMiss: 4 }), 3)).toBe('Can miss 4 periods');
    expect(shortLine(line({}))).toBe('Just at 75%');
    expect(shortLine(line({ met: false, need: 10 }))).toBe('Attend 10 classes to reach 75%');
    expect(shortLine(line({ met: false, reachable: false }))).toBe('75% can’t be reached this term');
    expect(shortLine(null)).toBeNull();
  });

  it('puts the subjects needing attention first', () => {
    const rows = [
      { name: 'Lab', percent: 8333 },
      { name: 'Cloud', percent: 5833 },
      { name: 'New', percent: null },
      { name: 'COI', percent: 6800 },
    ];
    expect(byAttention(rows).map((row) => row.name)).toEqual(['Cloud', 'COI', 'Lab', 'New']);
  });
});

describe('the semester row in settings', () => {
  it('says the dates and the rule', () => {
    expect(datesDetail({ startsOn: '2026-07-20', endsOn: '2026-11-18', requiredPercent: 75, condonationPercent: 65 })).toBe('20 Jul 2026 to 18 Nov 2026. 75% required, condonation from 65%.');
    expect(datesDetail({ startsOn: '2026-07-20', endsOn: null, requiredPercent: null, condonationPercent: null })).toBe('From 20 Jul 2026, no end date. No minimum attendance.');
    expect(datesDetail({ startsOn: '2026-07-20', endsOn: '2026-11-18', requiredPercent: 80, condonationPercent: null })).toBe('20 Jul 2026 to 18 Nov 2026. 80% required.');
  });
});
