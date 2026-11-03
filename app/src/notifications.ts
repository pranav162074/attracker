import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL = 'reminders';

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

export const replaceReminders = async (dates: Date[]) => {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (dates.length === 0) return 0;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Attendance reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  for (const date of dates) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Mark today’s attendance', body: 'Mark any class you missed or that was cancelled. Everything else counts as attended.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
    });
  }
  return dates.length;
};

export const clearReminders = () => Notifications.cancelAllScheduledNotificationsAsync();
