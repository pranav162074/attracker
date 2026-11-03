import type { DayOverview } from './api.ts';
import { parseIso } from './dates.ts';
import { parseTime, showTime } from './grid.ts';

export const DEFAULT_REMINDER_MINUTE = 17 * 60;
export const DAYS_AHEAD = 14;

export type ReminderSettings = { enabled: boolean; minute: number };

export const readSettings = (enabled: string | null, minute: string | null): ReminderSettings => {
  const parsed = minute === null ? NaN : Number(minute);
  return {
    enabled: enabled === 'on',
    minute: Number.isInteger(parsed) && parsed >= 0 && parsed < 1440 ? parsed : DEFAULT_REMINDER_MINUTE,
  };
};

export const checkReminderTime = (text: string): { minute: number | null; error: string | null } => {
  const minute = parseTime(text);
  if (minute === null || minute >= 1440) return { minute: null, error: text.trim() ? 'Enter a time like 5:00 pm' : 'Enter the time' };
  return { minute, error: null };
};

export const reminderTimeText = (minute: number) => showTime(minute);

export const localAt = (date: string, minute: number) => {
  const { year, month, day } = parseIso(date);
  return new Date(year, month, day, Math.floor(minute / 60), minute % 60, 0, 0);
};

export const reminderDates = (days: DayOverview[], minute: number, now: Date) => {
  const dates = new Set<string>();
  for (const day of days) {
    if (day.kind === 'outside') continue;
    if (day.classes === 0) continue;
    if (day.cancelled === day.classes) continue;
    dates.add(day.date);
  }
  return [...dates]
    .sort()
    .map((date) => localAt(date, minute))
    .filter((when) => when.getTime() > now.getTime());
};

export const reminderSummary = (settings: ReminderSettings, scheduled: number | null) => {
  if (!settings.enabled) return 'Off';
  const at = reminderTimeText(settings.minute);
  if (scheduled === null) return `On, at ${at} on days with classes`;
  if (scheduled === 0) return `On, at ${at}. No classes in the next ${DAYS_AHEAD} days, so nothing is set yet.`;
  return `On, at ${at} on days with classes. ${scheduled} ${scheduled === 1 ? 'reminder is' : 'reminders are'} set for the next ${DAYS_AHEAD} days.`;
};
