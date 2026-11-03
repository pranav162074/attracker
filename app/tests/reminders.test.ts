import { describe, it, expect } from 'vitest';
import type { DayOverview } from '../src/lib/api.ts';
import { checkReminderTime, DEFAULT_REMINDER_MINUTE, localAt, readSettings, reminderDates, reminderSummary } from '../src/lib/reminders.ts';

const day = (date: string, values: Partial<DayOverview> = {}): DayOverview => ({
  date,
  kind: 'normal',
  label: null,
  followsWeekday: null,
  classes: 5,
  held: 0,
  attended: 0,
  absent: 0,
  cancelled: 0,
  upcoming: 5,
  plannedAbsent: 0,
  extra: 0,
  swapped: 0,
  ...values,
});

const at = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

describe('when reminders go off', () => {
  it('only on days with classes, at the chosen time, never in the past', () => {
    const now = new Date(2026, 10, 3, 18, 0);
    const days = [
      day('2026-11-03'),
      day('2026-11-04'),
      day('2026-11-05', { kind: 'holiday', classes: 0 }),
      day('2026-11-06', { classes: 2, cancelled: 2 }),
      day('2026-11-07', { classes: 0 }),
      day('2026-11-08', { kind: 'holiday', classes: 1, extra: 1 }),
      day('2026-11-20', { kind: 'outside', classes: 0 }),
    ];
    expect(reminderDates(days, 17 * 60, now).map(at)).toEqual(['2026-11-04 17:00', '2026-11-08 17:00']);
    expect(reminderDates(days, 19 * 60 + 30, now).map(at)).toEqual(['2026-11-03 19:30', '2026-11-04 19:30', '2026-11-08 19:30']);
  });

  it('sets one reminder a day even with several timetables', () => {
    const now = new Date(2026, 10, 3, 8, 0);
    const college = [day('2026-11-03'), day('2026-11-04')];
    const dance = [day('2026-11-03', { classes: 1 }), day('2026-11-08', { classes: 1 })];
    expect(reminderDates([...college, ...dance], 17 * 60, now).map(at)).toEqual(['2026-11-03 17:00', '2026-11-04 17:00', '2026-11-08 17:00']);
  });

  it('uses the phone’s own clock for the day and time', () => {
    expect(at(localAt('2026-11-03', 17 * 60 + 5))).toBe('2026-11-03 17:05');
  });
});

describe('reminder settings', () => {
  it('reads saved settings, falling back to 5 pm and off', () => {
    expect(readSettings(null, null)).toEqual({ enabled: false, minute: DEFAULT_REMINDER_MINUTE });
    expect(readSettings('on', '1170')).toEqual({ enabled: true, minute: 1170 });
    expect(readSettings('on', 'nonsense')).toEqual({ enabled: true, minute: DEFAULT_REMINDER_MINUTE });
    expect(readSettings('off', '5000')).toEqual({ enabled: false, minute: DEFAULT_REMINDER_MINUTE });
  });

  it('reads the time the way the timetable does', () => {
    expect(checkReminderTime('5:00 pm')).toEqual({ minute: 17 * 60, error: null });
    expect(checkReminderTime('5')).toEqual({ minute: 17 * 60, error: null });
    expect(checkReminderTime('21:15')).toEqual({ minute: 21 * 60 + 15, error: null });
    expect(checkReminderTime('')).toEqual({ minute: null, error: 'Enter the time' });
    expect(checkReminderTime('teatime')).toEqual({ minute: null, error: 'Enter a time like 5:00 pm' });
  });

  it('says what is set up', () => {
    expect(reminderSummary({ enabled: false, minute: 1020 }, null)).toBe('Off');
    expect(reminderSummary({ enabled: true, minute: 1020 }, null)).toBe('On, at 5:00 pm on days with classes');
    expect(reminderSummary({ enabled: true, minute: 1020 }, 9)).toBe('On, at 5:00 pm on days with classes. 9 reminders are set for the next 14 days.');
    expect(reminderSummary({ enabled: true, minute: 1020 }, 1)).toBe('On, at 5:00 pm on days with classes. 1 reminder is set for the next 14 days.');
    expect(reminderSummary({ enabled: true, minute: 1020 }, 0)).toBe('On, at 5:00 pm. No classes in the next 14 days, so nothing is set yet.');
  });
});
