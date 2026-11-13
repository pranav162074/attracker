import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ACTIONS, CLASS_CATEGORY } from './lib/reminders.ts';
import type { ClassReminder } from './lib/reminders.ts';

const CHANNEL = 'after-class';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export const notificationsSupported = true;

export const askPermission = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
};

export const hasPermission = async () => (await Notifications.getPermissionsAsync()).granted;

const prepare = async () => {
  if (Platform.OS === 'android') {
    await Notifications.deleteNotificationChannelAsync('reminders').catch(() => {});
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'After-class reminders', importance: Notifications.AndroidImportance.HIGH });
  }
  await Notifications.setNotificationCategoryAsync(
    CLASS_CATEGORY,
    ACTIONS.map((action) => ({ identifier: action.id, buttonTitle: action.title, options: { opensAppToForeground: false } }))
  );
};

export const replaceReminders = async (reminders: ClassReminder[]) => {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (reminders.length === 0) return 0;
  await prepare();
  for (const reminder of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body, data: reminder.data, categoryIdentifier: CLASS_CATEGORY },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: CHANNEL },
    });
  }
  return reminders.length;
};

export const clearReminders = () => Notifications.cancelAllScheduledNotificationsAsync();
