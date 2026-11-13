import type { ClassReminder } from './lib/reminders.ts';

export const notificationsSupported = false;

export const askPermission = async () => false;

export const hasPermission = async () => false;

export const replaceReminders = async (_reminders: ClassReminder[]) => 0;

export const clearReminders = async () => {};
