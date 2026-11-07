import { describe, it, expect } from 'vitest';
import type { Line, OverviewItem } from '../src/lib/api.ts';
import { classTitle, formatClock, lineMessage, formatDay, localDate, overviewLine, requiredMessage, statusText, statusTone, zoneBadge } from '../src/lib/format.ts';

const line = (values: Partial<Line>): Line => ({ name: 'required', percent: 75, met: true, canMiss: 0, need: 0, reachable: true, ...values });

const item = (values: Partial<OverviewItem>): OverviewItem => ({
  timetableId: 1,
  name: 'College',
  status: 'tracking',
  percent: 60.97,
  percentText: '60.97',
  zone: 'below',
  held: 246,
  attended: 150,
  required: null,
  ...values,
});

describe('dates and times', () => {
  it('writes a day the way people say it', () => {
    expect(formatDay('2026-11-01')).toBe('Sunday, 1 November');
    expect(formatDay('2026-07-20')).toBe('Monday, 20 July');
    expect(formatDay('2028-02-29')).toBe('Tuesday, 29 February');
  });

  it('uses the phone’s own date, not UTC', () => {
    expect(localDate(new Date(2026, 10, 1, 23, 59))).toBe('2026-11-01');
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('shows class times on a 12-hour clock', () => {
    expect(formatClock('08:40')).toBe('8:40 am');
    expect(formatClock('12:00')).toBe('12:00 pm');
    expect(formatClock('13:30')).toBe('1:30 pm');
    expect(formatClock('00:15')).toBe('12:15 am');
    expect(formatClock('24:00')).toBe('12:00 am');
  });
});

describe('what the required percentage means for you', () => {
  it('says how many classes you can miss', () => {
    expect(requiredMessage(line({ canMiss: 5 }))).toBe('You can miss 5 classes and stay at 75% or above.');
    expect(requiredMessage(line({ canMiss: 1 }))).toBe('You can miss 1 class and stay at 75% or above.');
  });

  it('warns when you are exactly at the line', () => {
    expect(requiredMessage(line({ canMiss: 0 }))).toBe('You are just at 75%. Missing the next class takes you below it.');
  });

  it('says how many classes in a row get you back', () => {
    expect(requiredMessage(line({ met: false, need: 138, reachable: true }))).toBe('Attend the next 138 classes to get back to 75%.');
    expect(requiredMessage(line({ met: false, need: 1, reachable: null }))).toBe('Attend the next class to get back to 75%.');
    expect(lineMessage(line({ met: false, need: 1 }), 3)).toBe('Attend the next period to get back to 75%.');
  });

  it('says plainly when the line is out of reach', () => {
    expect(requiredMessage(line({ met: false, need: 200, reachable: false }))).toBe('75% can no longer be reached this term.');
  });

  it('keeps decimals in a required percentage', () => {
    expect(requiredMessage(line({ percent: 72.5, canMiss: 2 }))).toBe('You can miss 2 classes and stay at 72.5% or above.');
  });

  it('says nothing when there is no required percentage', () => {
    expect(requiredMessage(null)).toBeNull();
  });
});

describe('timetable cards', () => {
  it('labels each zone', () => {
    expect(zoneBadge('safe')).toEqual({ label: 'On track', tone: 'good' });
    expect(zoneBadge('condonation')).toEqual({ label: 'Condonation', tone: 'warn' });
    expect(zoneBadge('below')).toEqual({ label: 'Below minimum', tone: 'bad' });
    expect(zoneBadge(null)).toBeNull();
  });

  it('describes the numbers, an unstarted term, and an unfinished setup', () => {
    expect(overviewLine(item({}))).toBe('150 of 246 attended');
    expect(overviewLine(item({ held: 0, attended: 0 }))).toBe('No classes have been held yet.');
    expect(overviewLine(item({ status: 'setup' }))).toMatch(/Start tracking/);
  });
});

describe('today’s classes', () => {
  const base = { status: 'attended' as const, counts: true, tracking: true };

  it('labels each status', () => {
    expect(statusText(base)).toBe('Present');
    expect(statusText({ ...base, status: 'absent' })).toBe('Absent');
    expect(statusText({ ...base, status: 'upcoming' })).toBe('Upcoming');
    expect(statusText({ ...base, status: 'cancelled' })).toBe('Cancelled');
    expect(statusText({ ...base, counts: false })).toBe('Does not count');
    expect(statusText({ ...base, tracking: false })).toBe('Not tracking yet');
  });

  it('colours only what affects attendance', () => {
    expect(statusTone(base)).toBe('good');
    expect(statusTone({ ...base, status: 'absent' })).toBe('bad');
    expect(statusTone({ ...base, status: 'upcoming' })).toBe('neutral');
    expect(statusTone({ ...base, counts: false, status: 'absent' })).toBe('neutral');
  });

  it('shows how many periods a lab takes', () => {
    expect(classTitle({ subjectName: 'DWDM Lab', units: 3 })).toBe('DWDM Lab (3 periods)');
    expect(classTitle({ subjectName: 'Compiler Design', units: 1 })).toBe('Compiler Design');
    expect(classTitle({ subjectName: null, units: 1 })).toBe('Class');
  });
});
