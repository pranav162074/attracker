import { describe, it, expect, vi } from 'vitest';
import { ApiError, NetworkError } from '../src/lib/api.ts';
import type { UpcomingClass } from '../src/lib/api.ts';
import { answerReminder, classReminders, localAt, markFromAction, MOST_REMINDERS, readReminderData, readSettings, reminderSummary } from '../src/lib/reminders.ts';
import type { ReminderData } from '../src/lib/reminders.ts';

const cls = (date: string, start: string, end: string, values: Partial<UpcomingClass> = {}): UpcomingClass => ({
  timetableId: 1,
  timetableName: 'College',
  date,
  key: `${date}-${start}`,
  slotId: 10,
  extraId: null,
  subjectId: 5,
  scheduledSubjectId: 5,
  subjectName: 'Computer Networks',
  shortName: 'CN',
  start,
  end,
  counts: true,
  status: 'upcoming',
  plannedAbsent: false,
  ...values,
});

const at = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

const DATA: ReminderData = { timetableId: 1, date: '2026-11-16', slotId: 10, subjectName: 'Computer Networks', subjectId: 5, scheduledSubjectId: 5 };

describe('after-class reminders', () => {
  it('go off when each counting class ends, never in the past', () => {
    const now = new Date(2026, 10, 16, 11, 30);
    const classes = [
      cls('2026-11-16', '10:20', '11:10'),
      cls('2026-11-16', '12:00', '12:50'),
      cls('2026-11-16', '14:30', '15:20', { counts: false, subjectName: 'Counseling' }),
      cls('2026-11-17', '08:40', '11:10'),
    ];
    expect(classReminders(classes, now).map((item) => at(item.at))).toEqual(['2026-11-16 12:50', '2026-11-17 11:10']);
  });

  it('stay quiet for cancelled classes, classes already marked as missed and extra classes', () => {
    const now = new Date(2026, 10, 16, 8, 0);
    const classes = [
      cls('2026-11-16', '09:30', '10:20', { status: 'cancelled' }),
      cls('2026-11-16', '10:20', '11:10', { plannedAbsent: true }),
      cls('2026-11-16', '12:00', '12:50', { slotId: null, extraId: 4 }),
      cls('2026-11-16', '13:40', '14:30'),
    ];
    expect(classReminders(classes, now).map((item) => at(item.at))).toEqual(['2026-11-16 14:30']);
  });

  it('say which class ended, and which semester when there are several', () => {
    const now = new Date(2026, 10, 16, 8, 0);
    const [one] = classReminders([cls('2026-11-16', '10:20', '11:10')], now);
    expect(one).toMatchObject({ title: 'Computer Networks just ended', body: '10:20 am – 11:10 am. It counts as Present unless you change it.', data: DATA });
    const both = classReminders([cls('2026-11-16', '10:20', '11:10'), cls('2026-11-16', '17:00', '18:00', { timetableId: 2, timetableName: 'Dance', subjectName: 'Kuchipudi' })], now);
    expect(both.map((item) => item.body)).toEqual(['10:20 am – 11:10 am, College. It counts as Present unless you change it.', '5:00 pm – 6:00 pm, Dance. It counts as Present unless you change it.']);
  });

  it('keep the soonest ones when there are too many', () => {
    const now = new Date(2026, 10, 1, 0, 0);
    const classes = Array.from({ length: 200 }, (_, index) => cls(`2026-11-${String(2 + Math.floor(index / 10)).padStart(2, '0')}`, '09:00', `${10 + (index % 10)}:00`));
    const reminders = classReminders(classes, now);
    expect(reminders).toHaveLength(MOST_REMINDERS);
    expect(at(reminders[0]!.at)).toBe('2026-11-02 10:00');
  });

  it('use the phone’s own clock for the day and time', () => {
    expect(at(localAt('2026-11-03', 11 * 60 + 10))).toBe('2026-11-03 11:10');
  });
});

describe('answering a reminder', () => {
  it('turns each button into a mark, keeping a swapped subject', () => {
    expect(markFromAction('present', DATA)).toEqual({ attendance: 'present', substituteSubjectId: null });
    expect(markFromAction('absent', DATA)).toEqual({ attendance: 'absent', substituteSubjectId: null });
    expect(markFromAction('cancelled', DATA)).toEqual({ attendance: 'cancelled', substituteSubjectId: null });
    expect(markFromAction('absent', { ...DATA, subjectId: 7 })).toEqual({ attendance: 'absent', substituteSubjectId: 7 });
    expect(markFromAction('cancelled', { ...DATA, subjectId: 7 })).toEqual({ attendance: 'cancelled', substituteSubjectId: null });
    expect(markFromAction('expo.modules.notifications.actions.DEFAULT', DATA)).toBeNull();
  });

  it('reads back only well-formed notification data', () => {
    expect(readReminderData(JSON.parse(JSON.stringify(DATA)))).toEqual(DATA);
    expect(readReminderData({ ...DATA, date: 'tomorrow' })).toBeNull();
    expect(readReminderData({ ...DATA, slotId: '10' })).toBeNull();
    expect(readReminderData(null)).toBeNull();
  });

  const helpers = (send: () => Promise<unknown>, loggedIn = true) => ({ loggedIn, send: vi.fn(send), queue: vi.fn(async () => {}), tell: vi.fn(async () => {}) });

  it('sends the mark', async () => {
    const h = helpers(async () => ({}));
    expect(await answerReminder('absent', DATA, h)).toBe('sent');
    expect(h.send).toHaveBeenCalledWith({ attendance: 'absent', substituteSubjectId: null });
    expect(h.queue).not.toHaveBeenCalled();
    expect(h.tell).not.toHaveBeenCalled();
  });

  it('keeps the mark on the phone when offline, to send when the app opens', async () => {
    const h = helpers(async () => {
      throw new NetworkError();
    });
    expect(await answerReminder('cancelled', DATA, h)).toBe('queued');
    expect(h.queue).toHaveBeenCalledWith({ attendance: 'cancelled', substituteSubjectId: null });
  });

  it('says so when the server refuses', async () => {
    const h = helpers(async () => {
      throw new ApiError(409, 'not_tracking', 'Press Start Tracking before marking attendance');
    });
    expect(await answerReminder('absent', DATA, h)).toBe('failed');
    expect(h.tell).toHaveBeenCalledWith('Computer Networks was not marked', 'Press Start Tracking before marking attendance. Open attracker to mark it.');
  });

  it('says so when logged out, without trying', async () => {
    const h = helpers(async () => ({}), false);
    expect(await answerReminder('present', DATA, h)).toBe('failed');
    expect(h.send).not.toHaveBeenCalled();
    expect(h.tell).toHaveBeenCalledWith('Computer Networks was not marked', 'You are logged out. Open attracker to mark it.');
  });

  it('ignores a plain tap, which opens the day instead', async () => {
    const h = helpers(async () => ({}));
    expect(await answerReminder('expo.modules.notifications.actions.DEFAULT', DATA, h)).toBe('ignored');
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe('reminder settings', () => {
  it('are off until turned on', () => {
    expect(readSettings(null)).toEqual({ enabled: false });
    expect(readSettings('off')).toEqual({ enabled: false });
    expect(readSettings('on')).toEqual({ enabled: true });
  });

  it('say what is set up', () => {
    expect(reminderSummary({ enabled: false }, null)).toBe('Off');
    expect(reminderSummary({ enabled: true }, null)).toBe('On, when each class ends');
    expect(reminderSummary({ enabled: true }, 34)).toBe('On, when each class ends. 34 reminders are set for the next 14 days.');
    expect(reminderSummary({ enabled: true }, 1)).toBe('On, when each class ends. 1 reminder is set for the next 14 days.');
    expect(reminderSummary({ enabled: true }, 0)).toBe('On, when each class ends. No classes in the next 14 days, so nothing is set yet.');
  });
});
