import { describe, it, expect } from 'vitest';
import type { Day, DayClass } from '../src/lib/api.ts';
import { canMark, choiceOf, dayNotes, dayTitle, dayTotals, markFor, shiftDay, statusLine } from '../src/lib/day.ts';

const cls = (values: Partial<DayClass>): DayClass => ({
  key: 's1@2026-11-02',
  slotId: 1,
  extraId: null,
  subjectId: 5,
  scheduledSubjectId: 5,
  start: '08:40',
  end: '11:10',
  units: 3,
  counts: true,
  status: 'attended',
  plannedAbsent: false,
  cancelledBy: null,
  beforeCheckpoint: false,
  ...values,
});

const day = (values: Partial<Day>): Day => ({ date: '2026-11-02', kind: 'normal', label: null, followsWeekday: null, tracking: true, classes: [], ...values });

describe('moving between days', () => {
  it('steps across months and years', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('names today, yesterday and tomorrow', () => {
    expect(dayTitle('2026-11-03', '2026-11-03')).toBe('Today, Tuesday, 3 November');
    expect(dayTitle('2026-11-02', '2026-11-03')).toBe('Yesterday, Monday, 2 November');
    expect(dayTitle('2026-11-04', '2026-11-03')).toBe('Tomorrow, Wednesday, 4 November');
    expect(dayTitle('2026-10-05', '2026-11-03')).toBe('Monday, 5 October');
  });
});

describe('marking a class', () => {
  it('shows which choice is selected', () => {
    expect(choiceOf(cls({}))).toBe('present');
    expect(choiceOf(cls({ status: 'upcoming' }))).toBe('present');
    expect(choiceOf(cls({ status: 'absent' }))).toBe('absent');
    expect(choiceOf(cls({ status: 'upcoming', plannedAbsent: true }))).toBe('absent');
    expect(choiceOf(cls({ status: 'cancelled', cancelledBy: 'mark' }))).toBe('cancelled');
  });

  it('keeps a swapped subject when switching between present and absent, and drops it when cancelling', () => {
    const swapped = cls({ subjectId: 9, scheduledSubjectId: 5 });
    expect(markFor('absent', swapped)).toEqual({ attendance: 'absent', substituteSubjectId: 9 });
    expect(markFor('present', swapped)).toEqual({ attendance: 'present', substituteSubjectId: 9 });
    expect(markFor('cancelled', swapped)).toEqual({ attendance: 'cancelled', substituteSubjectId: null });
    expect(markFor('absent', cls({}))).toEqual({ attendance: 'absent', substituteSubjectId: null });
  });

  it('cannot change classes lost to a half day, or anything before tracking starts', () => {
    expect(canMark(day({}), cls({}))).toBe(true);
    expect(canMark(day({}), cls({ status: 'cancelled', cancelledBy: 'half_day' }))).toBe(false);
    expect(canMark(day({ tracking: false }), cls({}))).toBe(false);
  });

  it('says what each status means', () => {
    expect(statusLine(cls({}))).toBe('Present');
    expect(statusLine(cls({ status: 'absent' }))).toBe('Absent');
    expect(statusLine(cls({ status: 'upcoming' }))).toBe('Not started yet, counts as attended once it starts');
    expect(statusLine(cls({ status: 'upcoming', counts: false }))).toBe('Not started yet');
    expect(statusLine(cls({ status: 'upcoming', plannedAbsent: true }))).toBe('You plan to miss this');
    expect(statusLine(cls({ status: 'cancelled', cancelledBy: 'mark' }))).toBe('Cancelled, does not count');
    expect(statusLine(cls({ status: 'cancelled', cancelledBy: 'half_day' }))).toBe('Not held, half day');
    expect(statusLine(cls({ counts: false }))).toBe('Does not count for attendance');
  });
});

describe('the day', () => {
  it('explains holidays, swapped days, half days and official numbers', () => {
    expect(dayNotes(day({ kind: 'holiday', label: 'Diwali' }))).toEqual(['Holiday: Diwali. No regular classes.']);
    expect(dayNotes(day({ kind: 'follows_weekday', followsWeekday: 1, label: 'Instead of 2 Oct' }))).toEqual(['Runs Monday’s timetable (Instead of 2 Oct).']);
    expect(dayNotes(day({ kind: 'half_day' }))).toEqual(['Half day.']);
    expect(dayNotes(day({ kind: 'outside' }))).toEqual(['This day is outside the timetable’s dates.']);
    expect(dayNotes(day({ tracking: false }))).toEqual(['Press Start Tracking on the timetable before marking attendance.']);
    expect(dayNotes(day({ classes: [cls({ beforeCheckpoint: true })] }))[0]).toMatch(/official numbers/);
    expect(dayNotes(day({}))).toEqual([]);
  });

  it('adds up the classes held so far', () => {
    const classes = [
      cls({ units: 3 }),
      cls({ key: 'b', units: 1, status: 'absent' }),
      cls({ key: 'c', units: 1, status: 'cancelled', cancelledBy: 'mark' }),
      cls({ key: 'd', units: 1, counts: false }),
      cls({ key: 'e', units: 1, status: 'upcoming' }),
    ];
    expect(dayTotals({ classes })).toEqual({ held: 4, attended: 3 });
  });
});
