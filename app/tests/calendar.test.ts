import { describe, it, expect } from 'vitest';
import type { CalendarDay } from '../src/lib/api.ts';
import { byDate, checkDayForm, dayFormFrom, describeDay, formatRange, newDayForm } from '../src/lib/calendar.ts';

const term = { startsOn: '2026-07-20', endsOn: '2026-11-14' };

const day = (values: Partial<CalendarDay>): CalendarDay => ({
  id: 1,
  kind: 'holiday',
  startsOn: '2026-08-15',
  endsOn: '2026-08-15',
  followsWeekday: null,
  cutoff: null,
  label: null,
  ...values,
});

describe('showing calendar entries', () => {
  it('writes dates and ranges briefly', () => {
    expect(formatRange('2026-08-15', '2026-08-15')).toBe('15 Aug 2026');
    expect(formatRange('2026-09-07', '2026-09-12')).toBe('7 to 12 Sep 2026');
    expect(formatRange('2026-10-29', '2026-11-03')).toBe('29 Oct to 3 Nov 2026');
    expect(formatRange('2026-12-28', '2027-01-02')).toBe('28 Dec 2026 to 2 Jan 2027');
  });

  it('describes each kind of day', () => {
    expect(describeDay(day({ label: 'Independence Day' }))).toEqual({ title: '15 Aug 2026', detail: 'Holiday · Independence Day' });
    expect(describeDay(day({ startsOn: '2026-09-07', endsOn: '2026-09-12', label: 'Mid exams' })).detail).toBe('Holiday, 6 days · Mid exams');
    expect(describeDay(day({ startsOn: '2026-10-31', endsOn: '2026-11-01' })).detail).toBe('Holiday, 2 days');
    expect(describeDay(day({ kind: 'follows_weekday', startsOn: '2026-08-22', endsOn: '2026-08-22', followsWeekday: 1 })).detail).toBe('Follows Monday’s timetable');
    expect(describeDay(day({ kind: 'no_classes_after', cutoff: '12:00' })).detail).toBe('Half day, classes until 12:00 pm');
    expect(describeDay(day({ kind: 'no_classes_before', cutoff: '13:40' })).detail).toBe('Half day, classes from 1:40 pm');
  });

  it('lists entries by date', () => {
    const list = byDate([day({ id: 3, startsOn: '2026-10-02', endsOn: '2026-10-02' }), day({ id: 2 }), day({ id: 1, startsOn: '2026-07-25', endsOn: '2026-07-25' })]);
    expect(list.map((item) => item.id)).toEqual([1, 2, 3]);
  });
});

describe('the day form', () => {
  it('saves a one-day holiday', () => {
    expect(checkDayForm({ ...newDayForm(), startsOn: '2026-08-15', label: ' Independence Day ' }, term)).toEqual({
      input: { kind: 'holiday', startsOn: '2026-08-15', endsOn: '2026-08-15', followsWeekday: null, cutoff: null, label: 'Independence Day' },
      errors: {},
    });
  });

  it('saves a break of several days', () => {
    const { input } = checkDayForm({ ...newDayForm(), startsOn: '2026-10-19', endsOn: '2026-10-24', label: 'Dasara' }, term);
    expect(input).toMatchObject({ startsOn: '2026-10-19', endsOn: '2026-10-24' });
  });

  it('saves a Saturday that follows Monday', () => {
    const { input } = checkDayForm({ ...newDayForm(), type: 'follows', startsOn: '2026-08-22', endsOn: '2026-08-29', followsWeekday: 1 }, term);
    expect(input).toEqual({ kind: 'follows_weekday', startsOn: '2026-08-22', endsOn: '2026-08-22', followsWeekday: 1, cutoff: null, label: null });
  });

  it('saves half days either way round', () => {
    const morning = checkDayForm({ ...newDayForm(), type: 'half', startsOn: '2026-08-28', cutoff: '12' }, term).input;
    expect(morning).toMatchObject({ kind: 'no_classes_after', cutoff: '12:00', endsOn: '2026-08-28', followsWeekday: null });
    const afternoon = checkDayForm({ ...newDayForm(), type: 'half', halfKind: 'no_classes_before', startsOn: '2026-08-28', cutoff: '1:40' }, term).input;
    expect(afternoon).toMatchObject({ kind: 'no_classes_before', cutoff: '13:40' });
  });

  it('explains what is missing or wrong', () => {
    expect(checkDayForm(newDayForm(), term).errors).toEqual({ startsOn: 'Choose the date' });
    expect(checkDayForm({ ...newDayForm(), startsOn: '2026-07-19' }, term).errors).toEqual({ startsOn: 'Must be between 20 Jul 2026 and 14 Nov 2026' });
    expect(checkDayForm({ ...newDayForm(), startsOn: '2026-07-19' }, { startsOn: '2026-07-20', endsOn: null }).errors).toEqual({ startsOn: 'Must be on or after 20 Jul 2026' });
    expect(checkDayForm({ ...newDayForm(), startsOn: '2026-11-10', endsOn: '2026-11-20' }, term).errors).toEqual({ endsOn: 'Must be between 20 Jul 2026 and 14 Nov 2026' });
    expect(checkDayForm({ ...newDayForm(), startsOn: '2026-09-12', endsOn: '2026-09-07' }, term).errors).toEqual({ endsOn: 'Must be on or after the first day' });
    expect(checkDayForm({ ...newDayForm(), type: 'half', startsOn: '2026-08-28' }, term).errors).toEqual({ cutoff: 'Enter the time' });
    expect(checkDayForm({ ...newDayForm(), type: 'half', startsOn: '2026-08-28', cutoff: 'noon' }, term).errors).toEqual({ cutoff: 'Enter a time like 12:00 or 1:40 pm' });
  });

  it('fills the form from a saved entry', () => {
    expect(dayFormFrom(day({ kind: 'no_classes_before', cutoff: '13:40' }))).toMatchObject({ type: 'half', halfKind: 'no_classes_before', cutoff: '1:40 pm', endsOn: null });
    expect(dayFormFrom(day({ startsOn: '2026-09-07', endsOn: '2026-09-12' }))).toMatchObject({ type: 'holiday', endsOn: '2026-09-12' });
    expect(dayFormFrom(day({ kind: 'follows_weekday', followsWeekday: 3 }))).toMatchObject({ type: 'follows', followsWeekday: 3 });
    const round = checkDayForm(dayFormFrom(day({ kind: 'no_classes_before', cutoff: '13:40' })), term).input;
    expect(round).toMatchObject({ kind: 'no_classes_before', cutoff: '13:40' });
  });
});
