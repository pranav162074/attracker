import { localDate } from './lib/format.ts';
import { shiftDay } from './lib/day.ts';
import { DAYS_AHEAD, readSettings, reminderDates } from './lib/reminders.ts';
import type { ReminderSettings } from './lib/reminders.ts';
import { clearReminders, hasPermission, notificationsSupported, replaceReminders } from './notifications';
import { prefs } from './prefs';
import { api } from './session.tsx';

export const loadReminderSettings = async () => readSettings(await prefs.read('reminder.enabled'), await prefs.read('reminder.minute'));

export const saveReminderSettings = async (settings: ReminderSettings) => {
  await prefs.save('reminder.enabled', settings.enabled ? 'on' : 'off');
  await prefs.save('reminder.minute', String(settings.minute));
};

export const syncReminders = async (now = new Date()) => {
  if (!notificationsSupported) return null;
  const settings = await loadReminderSettings();
  if (!settings.enabled || !(await hasPermission())) {
    await clearReminders();
    return settings.enabled ? null : 0;
  }
  const from = localDate(now);
  const to = shiftDay(from, DAYS_AHEAD - 1);
  const tracked = (await api.overview()).filter((timetable) => timetable.status === 'tracking');
  const ranges = await Promise.all(tracked.map((timetable) => api.days(timetable.timetableId, from, to)));
  return replaceReminders(reminderDates(ranges.flatMap((range) => range.days), settings.minute, now));
};

export const stopReminders = async () => {
  if (notificationsSupported) await clearReminders().catch(() => {});
};

let lastSync = 0;

export const syncRemindersSoon = () => {
  const now = Date.now();
  if (!notificationsSupported || now - lastSync < 10 * 60 * 1000) return;
  lastSync = now;
  syncReminders().catch(() => {
    lastSync = 0;
  });
};
