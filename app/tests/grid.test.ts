import { describe, it, expect } from 'vitest';
import {
  archivedInUse,
  checkClass,
  classFormFor,
  copyDay,
  dayCounts,
  fromServer,
  guessPeriods,
  parseTime,
  periodLength,
  replaceSlot,
  sameGrid,
  showTime,
  slotsOn,
  suggestNext,
  toServer,
} from '../src/lib/grid.ts';
import type { DraftSlot } from '../src/lib/grid.ts';

const at = (hours: number, minutes = 0) => hours * 60 + minutes;

const monday: DraftSlot[] = fromServer([
  { id: 1, weekday: 1, start: '08:40', end: '11:10', periods: 3, subjectId: 5 },
  { id: 2, weekday: 1, start: '12:00', end: '12:50', periods: 1, subjectId: 1 },
  { id: 3, weekday: 1, start: '12:50', end: '13:40', periods: 1, subjectId: 3 },
  { id: 4, weekday: 1, start: '13:40', end: '14:30', periods: 1, subjectId: 2 },
  { id: 5, weekday: 2, start: '08:40', end: '09:30', periods: 1, subjectId: 2 },
]);

describe('reading typed times', () => {
  it('reads the usual ways people write a time', () => {
    expect(parseTime('8:40')).toBe(at(8, 40));
    expect(parseTime('08:40')).toBe(at(8, 40));
    expect(parseTime('8.40')).toBe(at(8, 40));
    expect(parseTime('840')).toBe(at(8, 40));
    expect(parseTime('13:40')).toBe(at(13, 40));
    expect(parseTime('1340')).toBe(at(13, 40));
    expect(parseTime('9')).toBe(at(9));
  });

  it('treats 1 to 6 without am or pm as afternoon, since classes rarely start before 7', () => {
    expect(parseTime('1:40')).toBe(at(13, 40));
    expect(parseTime('6:30')).toBe(at(18, 30));
    expect(parseTime('7:00')).toBe(at(7));
    expect(parseTime('12:00')).toBe(at(12));
    expect(parseTime('12:50')).toBe(at(12, 50));
  });

  it('follows am and pm when given', () => {
    expect(parseTime('6:30 am')).toBe(at(6, 30));
    expect(parseTime('1:40 PM')).toBe(at(13, 40));
    expect(parseTime('1:40pm')).toBe(at(13, 40));
    expect(parseTime('12 am')).toBe(0);
    expect(parseTime('12:15 pm')).toBe(at(12, 15));
    expect(parseTime('7 p.m.')).toBe(at(19));
  });

  it('refuses things that are not times', () => {
    for (const text of ['', 'noon', '25:00', '8:60', '13 pm', '0 am', '8:4', '8:400']) expect(parseTime(text)).toBeNull();
  });

  it('shows minutes back on a 12-hour clock', () => {
    expect(showTime(at(8, 40))).toBe('8:40 am');
    expect(showTime(at(13, 40))).toBe('1:40 pm');
  });
});

describe('the draft week', () => {
  it('converts to and from what the API uses', () => {
    expect(monday[0]).toEqual({ key: 'slot-1', weekday: 1, start: at(8, 40), end: at(11, 10), periods: 3, subjectId: 5 });
    const shuffled = [monday[4]!, monday[2]!, monday[0]!];
    expect(toServer(shuffled)).toEqual([
      { weekday: 1, start: '08:40', end: '11:10', periods: 3, subjectId: 5 },
      { weekday: 1, start: '12:50', end: '13:40', periods: 1, subjectId: 3 },
      { weekday: 2, start: '08:40', end: '09:30', periods: 1, subjectId: 2 },
    ]);
  });

  it('counts classes per day and lists a day in time order', () => {
    expect(dayCounts(monday)).toEqual([4, 1, 0, 0, 0, 0, 0]);
    expect(slotsOn([...monday].reverse(), 1).map((slot) => slot.start)).toEqual([at(8, 40), at(12), at(12, 50), at(13, 40)]);
  });

  it('learns the period length and guesses periods from it', () => {
    expect(periodLength(monday)).toBe(50);
    expect(periodLength([])).toBeNull();
    expect(guessPeriods(at(8, 40), at(11, 10), monday)).toBe(3);
    expect(guessPeriods(at(14, 30), at(15, 20), monday)).toBe(1);
    expect(guessPeriods(at(8, 40), at(11, 10), [])).toBe(1);
  });

  it('suggests the next class right after the last one', () => {
    expect(suggestNext(monday, 1)).toEqual({ start: at(14, 30), end: at(15, 20) });
    expect(suggestNext(monday, 3)).toEqual({ start: at(8, 40), end: at(9, 30) });
    expect(suggestNext([], 1)).toBeNull();
    const form = classFormFor(null, suggestNext(monday, 1));
    expect(form).toEqual({ subjectId: null, start: '2:30 pm', end: '3:20 pm', periods: 1 });
  });

  it('copies a day, replacing what was there', () => {
    const copied = copyDay(monday, 1, 2);
    expect(dayCounts(copied)).toEqual([4, 4, 0, 0, 0, 0, 0]);
    expect(slotsOn(copied, 2).map((slot) => slot.subjectId)).toEqual([5, 1, 3, 2]);
    expect(new Set(copied.map((slot) => slot.key)).size).toBe(copied.length);
  });

  it('notices whether anything changed', () => {
    expect(sameGrid(monday, [...monday].reverse())).toBe(true);
    expect(sameGrid(monday, monday.slice(1))).toBe(false);
  });

  it('finds classes that use archived subjects', () => {
    expect(archivedInUse(monday, new Set([2, 9]))).toEqual([2]);
    expect(archivedInUse(monday, new Set())).toEqual([]);
  });
});

describe('checking a class before adding it', () => {
  const form = { subjectId: 4, start: '2:30', end: '3:20', periods: 1 };

  it('adds a class that fits', () => {
    const { slot, errors } = checkClass(form, 1, monday, null);
    expect(errors).toEqual({});
    expect(slot).toMatchObject({ weekday: 1, start: at(14, 30), end: at(15, 20), periods: 1, subjectId: 4 });
    expect(replaceSlot(monday, slot!)).toHaveLength(6);
  });

  it('asks for a subject and readable times', () => {
    expect(checkClass({ subjectId: null, start: '', end: 'later', periods: 1 }, 1, monday, null).errors).toEqual({
      subject: 'Choose a subject',
      start: 'Enter the start time',
      end: 'Enter a time like 9:30 or 2:20 pm',
    });
  });

  it('needs the end after the start', () => {
    expect(checkClass({ ...form, end: '2:30' }, 1, monday, null).errors).toEqual({ end: 'Must be after the start time' });
  });

  it('refuses a class that overlaps another on the same day', () => {
    expect(checkClass({ ...form, start: '1:00', end: '1:50' }, 1, monday, null).errors).toEqual({ start: 'Overlaps the 12:50 pm to 1:40 pm class' });
    expect(checkClass({ ...form, start: '1:00', end: '1:50' }, 2, monday, null).errors).toEqual({});
    expect(checkClass({ ...form, start: '13:40', end: '14:30' }, 1, monday, null).errors).toEqual({ start: 'Overlaps the 1:40 pm to 2:30 pm class' });
  });

  it('lets a class be moved over its own old time', () => {
    const edited = checkClass({ subjectId: 2, start: '1:50', end: '2:40', periods: 1 }, 1, monday, 'slot-4');
    expect(edited.errors).toEqual({});
    const next = replaceSlot(monday, edited.slot!);
    expect(next).toHaveLength(5);
    expect(next.find((slot) => slot.key === 'slot-4')).toMatchObject({ start: at(13, 50), end: at(14, 40) });
  });
});
