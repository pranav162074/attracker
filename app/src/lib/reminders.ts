import { ApiError, NetworkError } from './api.ts';
import type { Mark, UpcomingClass } from './api.ts';
import { parseIso } from './dates.ts';
import { formatClock } from './format.ts';
import { clockToMinutes } from './grid.ts';
import { markFor } from './day.ts';

export const DAYS_AHEAD = 14;
export const MOST_REMINDERS = 150;

export const CLASS_CATEGORY = 'class-ended';

export const ACTIONS = [
  { id: 'present', title: 'Present' },
  { id: 'absent', title: 'Absent' },
  { id: 'cancelled', title: 'Cancelled' },
] as const;

export type ReminderSettings = { enabled: boolean };

export type ReminderData = { timetableId: number; date: string; slotId: number; subjectName: string; subjectId: number; scheduledSubjectId: number };

export type ClassReminder = { at: Date; title: string; body: string; data: ReminderData };

export const readSettings = (enabled: string | null): ReminderSettings => ({ enabled: enabled === 'on' });

export const localAt = (date: string, minute: number) => {
  const { year, month, day } = parseIso(date);
  return new Date(year, month, day, Math.floor(minute / 60), minute % 60, 0, 0);
};

export const classReminders = (classes: UpcomingClass[], now: Date): ClassReminder[] => {
  const several = new Set(classes.map((item) => item.timetableId)).size > 1;
  return classes
    .filter((item) => item.counts && item.slotId !== null && item.status !== 'cancelled' && !item.plannedAbsent)
    .map((item) => {
      const subjectName = item.subjectName ?? 'Class';
      const time = `${formatClock(item.start)} – ${formatClock(item.end)}`;
      return {
        at: localAt(item.date, clockToMinutes(item.end)),
        title: `${subjectName} just ended`,
        body: `${time}${several ? `, ${item.timetableName}` : ''}. It counts as Present unless you change it.`,
        data: {
          timetableId: item.timetableId,
          date: item.date,
          slotId: item.slotId!,
          subjectName,
          subjectId: item.subjectId,
          scheduledSubjectId: item.scheduledSubjectId,
        },
      };
    })
    .filter((reminder) => reminder.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MOST_REMINDERS);
};

export const markFromAction = (action: string, data: ReminderData): Mark | null => {
  if (action !== 'present' && action !== 'absent' && action !== 'cancelled') return null;
  return markFor(action, data);
};

export const readReminderData = (value: unknown): ReminderData | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<ReminderData>;
  const numbers = [data.timetableId, data.slotId, data.subjectId, data.scheduledSubjectId];
  if (numbers.some((item) => typeof item !== 'number') || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return null;
  return {
    timetableId: data.timetableId!,
    date: data.date,
    slotId: data.slotId!,
    subjectName: typeof data.subjectName === 'string' ? data.subjectName : 'Class',
    subjectId: data.subjectId!,
    scheduledSubjectId: data.scheduledSubjectId!,
  };
};

export const failedText = (subjectName: string, message: string) => ({
  title: `${subjectName} was not marked`,
  body: `${/[.!?]$/.test(message.trim()) ? message.trim() : `${message.trim()}.`} Open attracker to mark it.`,
});

export type Answer = 'sent' | 'queued' | 'failed' | 'ignored';

export type AnswerHelpers = {
  loggedIn: boolean;
  send: (mark: Mark) => Promise<unknown>;
  queue: (mark: Mark) => Promise<unknown>;
  tell: (title: string, body: string) => Promise<unknown>;
};

export const answerReminder = async (action: string, data: ReminderData, helpers: AnswerHelpers): Promise<Answer> => {
  const mark = markFromAction(action, data);
  if (!mark) return 'ignored';
  if (!helpers.loggedIn) {
    const text = failedText(data.subjectName, 'You are logged out.');
    await helpers.tell(text.title, text.body).catch(() => {});
    return 'failed';
  }
  try {
    await helpers.send(mark);
    return 'sent';
  } catch (error) {
    if (error instanceof NetworkError) {
      await helpers.queue(mark);
      return 'queued';
    }
    const text = failedText(data.subjectName, error instanceof ApiError ? error.message : 'Something went wrong.');
    await helpers.tell(text.title, text.body).catch(() => {});
    return 'failed';
  }
};

export const reminderSummary = (settings: ReminderSettings, scheduled: number | null) => {
  if (!settings.enabled) return 'Off';
  if (scheduled === null) return 'On, when each class ends';
  if (scheduled === 0) return `On, when each class ends. No classes in the next ${DAYS_AHEAD} days, so nothing is set yet.`;
  return `On, when each class ends. ${scheduled} ${scheduled === 1 ? 'reminder is' : 'reminders are'} set for the next ${DAYS_AHEAD} days.`;
};
