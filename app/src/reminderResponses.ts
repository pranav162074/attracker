import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { apiUrl } from './config.ts';
import { createApi } from './lib/api.ts';
import { queueMark } from './lib/offline.ts';
import { answerReminder, readReminderData } from './lib/reminders.ts';
import { storage } from './storage.ts';
import { tokenStore } from './tokenStore';

const TASK = 'attracker-reminder-answer';

const answer = async (response: Notifications.NotificationResponse) => {
  const data = readReminderData(response.notification.request.content.data);
  if (!data) return;
  await Notifications.clearLastNotificationResponseAsync().catch(() => {});
  const token = await tokenStore.read().catch(() => null);
  const api = createApi({ baseUrl: apiUrl ?? '', mode: 'token', getToken: () => token, timeoutMs: 60_000 });
  const result = await answerReminder(response.actionIdentifier, data, {
    loggedIn: Boolean(token && apiUrl),
    send: (mark) => api.mark(data.timetableId, data.date, data.slotId, mark),
    queue: (mark) => queueMark(storage, { timetableId: data.timetableId, date: data.date, slotId: data.slotId, mark }),
    tell: (title, body) => Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }),
  });
  if (result !== 'ignored') await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
};

TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data }) => {
  if (data && 'actionIdentifier' in data) await answer(data).catch(() => {});
});

Notifications.registerTaskAsync(TASK).catch(() => {});

const handled = new Set<string>();

export const useReminderResponses = () => {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const id = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.has(id)) return;
    handled.add(id);
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      const data = readReminderData(response.notification.request.content.data);
      if (data) router.push(`/timetables/${data.timetableId}/days/${data.date}`);
      return;
    }
    answer(response).catch(() => {});
  }, [response, router]);
};
