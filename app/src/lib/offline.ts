import { ApiError, NetworkError } from './api.ts';
import type { Mark } from './api.ts';

export type KeyValue = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (keys: string[]) => Promise<void>;
  keys: () => Promise<readonly string[]>;
};

export const PREFIX = 'attracker.offline.';
const CACHE = `${PREFIX}cache.`;
const OUTBOX = `${PREFIX}outbox`;
const USER = `${PREFIX}user`;

export type Cached<T> = { savedAt: string; data: T };

const parse = <T>(text: string | null): T | null => {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export const readCache = async <T>(store: KeyValue, key: string) => parse<Cached<T>>(await store.get(CACHE + key).catch(() => null));

export const writeCache = async <T>(store: KeyValue, key: string, data: T, now = new Date()) => {
  await store.set(CACHE + key, JSON.stringify({ savedAt: now.toISOString(), data } satisfies Cached<T>)).catch(() => {});
};

export const loadWithCache = async <T>(store: KeyValue, key: string, load: () => Promise<T>, now = new Date()): Promise<{ data: T; savedAt: string | null }> => {
  try {
    const data = await load();
    await writeCache(store, key, data, now);
    return { data, savedAt: null };
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error;
    const cached = await readCache<T>(store, key);
    if (!cached) throw error;
    return { data: cached.data, savedAt: cached.savedAt };
  }
};

export const rememberUser = async <T>(store: KeyValue, user: T) => {
  await store.set(USER, JSON.stringify(user)).catch(() => {});
};

export const rememberedUser = async <T>(store: KeyValue) => parse<T>(await store.get(USER).catch(() => null));

export const forgetEverything = async (store: KeyValue) => {
  const keys = await store.keys().catch(() => [] as readonly string[]);
  const ours = keys.filter((key) => key.startsWith(PREFIX));
  if (ours.length > 0) await store.remove(ours).catch(() => {});
};

export type QueuedMark = { timetableId: number; date: string; slotId: number; mark: Mark; queuedAt: string };

export const readOutbox = async (store: KeyValue) => parse<QueuedMark[]>(await store.get(OUTBOX).catch(() => null)) ?? [];

const writeOutbox = (store: KeyValue, items: QueuedMark[]) => (items.length === 0 ? store.remove([OUTBOX]) : store.set(OUTBOX, JSON.stringify(items)));

const sameClass = (a: QueuedMark, b: Pick<QueuedMark, 'timetableId' | 'date' | 'slotId'>) => a.timetableId === b.timetableId && a.date === b.date && a.slotId === b.slotId;

export const queueMark = async (store: KeyValue, item: Omit<QueuedMark, 'queuedAt'>, now = new Date()) => {
  const items = (await readOutbox(store)).filter((queued) => !sameClass(queued, item));
  items.push({ ...item, queuedAt: now.toISOString() });
  await writeOutbox(store, items);
  return items.length;
};

export const pendingFor = (items: QueuedMark[], timetableId: number, date: string) => items.filter((item) => item.timetableId === timetableId && item.date === date);

export type FlushResult = { sent: number; dropped: Array<{ item: QueuedMark; message: string }>; left: number };

let flushing: Promise<FlushResult> | null = null;

export const flushOutbox = (store: KeyValue, send: (item: QueuedMark) => Promise<unknown>): Promise<FlushResult> => {
  if (flushing) return flushing;
  flushing = (async () => {
    const items = await readOutbox(store);
    const result: FlushResult = { sent: 0, dropped: [], left: 0 };
    const kept: QueuedMark[] = [];
    for (const [index, item] of items.entries()) {
      try {
        await send(item);
        result.sent += 1;
      } catch (error) {
        if (error instanceof NetworkError) {
          kept.push(...items.slice(index));
          break;
        }
        result.dropped.push({ item, message: error instanceof ApiError ? error.message : 'Could not be saved' });
      }
    }
    if (result.sent > 0 || result.dropped.length > 0) await writeOutbox(store, kept).catch(() => {});
    result.left = kept.length;
    return result;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
};

const pad = (value: number) => String(value).padStart(2, '0');

export const offlineNote = (savedAt: string, now = new Date()) => {
  const saved = new Date(savedAt);
  const hours = saved.getHours();
  const time = `${hours % 12 === 0 ? 12 : hours % 12}:${pad(saved.getMinutes())} ${hours >= 12 ? 'pm' : 'am'}`;
  const sameDay = saved.getFullYear() === now.getFullYear() && saved.getMonth() === now.getMonth() && saved.getDate() === now.getDate();
  const day = sameDay ? 'today' : `on ${saved.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][saved.getMonth()]}`;
  return `You are offline. This is what was loaded at ${time} ${day}.`;
};
