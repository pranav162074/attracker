import { describe, it, expect, vi } from 'vitest';
import { ApiError, NetworkError } from '../src/lib/api.ts';
import {
  flushOutbox,
  forgetEverything,
  loadWithCache,
  offlineNote,
  pendingFor,
  queueMark,
  readCache,
  readOutbox,
  rememberedUser,
  rememberUser,
  writeCache,
} from '../src/lib/offline.ts';
import type { KeyValue, QueuedMark } from '../src/lib/offline.ts';

const memory = () => {
  const map = new Map<string, string>();
  const store: KeyValue & { map: Map<string, string> } = {
    map,
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
    remove: async (keys) => {
      for (const key of keys) map.delete(key);
    },
    keys: async () => [...map.keys()],
  };
  return store;
};

const at = new Date(2026, 10, 3, 9, 5);

describe('showing the last numbers when offline', () => {
  it('saves what loaded and returns it fresh', async () => {
    const store = memory();
    expect(await loadWithCache(store, 'home', async () => ({ percent: 74.6 }), at)).toEqual({ data: { percent: 74.6 }, savedAt: null });
    expect(await readCache(store, 'home')).toEqual({ savedAt: at.toISOString(), data: { percent: 74.6 } });
  });

  it('falls back to the saved copy only when the network is down', async () => {
    const store = memory();
    await writeCache(store, 'home', { percent: 74.6 }, at);
    expect(await loadWithCache(store, 'home', async () => Promise.reject(new NetworkError()))).toEqual({ data: { percent: 74.6 }, savedAt: at.toISOString() });
    await expect(loadWithCache(store, 'home', async () => Promise.reject(new ApiError(404, 'not_found', 'Timetable not found')))).rejects.toBeInstanceOf(ApiError);
    await expect(loadWithCache(store, 'other', async () => Promise.reject(new NetworkError()))).rejects.toBeInstanceOf(NetworkError);
  });

  it('ignores a saved copy it cannot read', async () => {
    const store = memory();
    store.map.set('attracker.offline.cache.home', '{broken');
    await expect(loadWithCache(store, 'home', async () => Promise.reject(new NetworkError()))).rejects.toBeInstanceOf(NetworkError);
  });

  it('says when the shown numbers were loaded', () => {
    expect(offlineNote(at.toISOString(), new Date(2026, 10, 3, 11, 0))).toBe('You are offline. This is what was loaded at 9:05 am today.');
    expect(offlineNote(new Date(2026, 10, 2, 13, 30).toISOString(), at)).toBe('You are offline. This is what was loaded at 1:30 pm on 2 Nov.');
    expect(offlineNote(new Date(2026, 10, 2, 0, 15).toISOString(), at)).toBe('You are offline. This is what was loaded at 12:15 am on 2 Nov.');
  });

  it('remembers who is logged in, and forgets everything on logout but nothing else', async () => {
    const store = memory();
    store.map.set('someone.else', 'keep');
    await rememberUser(store, { id: 1, email: 'asha@example.com' });
    await writeCache(store, 'home', { percent: 1 });
    expect(await rememberedUser(store)).toEqual({ id: 1, email: 'asha@example.com' });
    await forgetEverything(store);
    expect(await rememberedUser(store)).toBeNull();
    expect([...store.map.keys()]).toEqual(['someone.else']);
  });
});

describe('marks made offline', () => {
  const absent = { attendance: 'absent' as const, substituteSubjectId: null };

  it('keeps one mark per class, the latest', async () => {
    const store = memory();
    expect(await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId: 5, mark: absent }, at)).toBe(1);
    expect(await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId: 6, mark: absent }, at)).toBe(2);
    expect(await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId: 5, mark: { attendance: 'cancelled', substituteSubjectId: null } }, at)).toBe(2);
    const items = await readOutbox(store);
    expect(items.map((item) => [item.slotId, item.mark.attendance])).toEqual([
      [6, 'absent'],
      [5, 'cancelled'],
    ]);
    expect(pendingFor(items, 1, '2026-11-03')).toHaveLength(2);
    expect(pendingFor(items, 1, '2026-11-04')).toHaveLength(0);
    expect(pendingFor(items, 2, '2026-11-03')).toHaveLength(0);
  });

  it('sends them in order once back online, and empties the outbox', async () => {
    const store = memory();
    await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId: 5, mark: absent });
    await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId: 6, mark: absent });
    const sent: number[] = [];
    const result = await flushOutbox(store, async (item: QueuedMark) => {
      sent.push(item.slotId);
    });
    expect(result).toEqual({ sent: 2, dropped: [], left: 0 });
    expect(sent).toEqual([5, 6]);
    expect(await readOutbox(store)).toEqual([]);
    expect(store.map.size).toBe(0);
  });

  it('stops at the first network failure and keeps the rest for later', async () => {
    const store = memory();
    for (const slotId of [5, 6, 7]) await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId, mark: absent });
    const send = vi.fn(async (item: QueuedMark) => {
      if (item.slotId === 6) throw new NetworkError();
    });
    expect(await flushOutbox(store, send)).toEqual({ sent: 1, dropped: [], left: 2 });
    expect((await readOutbox(store)).map((item) => item.slotId)).toEqual([6, 7]);
  });

  it('drops a mark the server refuses, so it does not block the others', async () => {
    const store = memory();
    for (const slotId of [5, 6]) await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId, mark: absent });
    const result = await flushOutbox(store, async (item: QueuedMark) => {
      if (item.slotId === 5) throw new ApiError(409, 'no_such_class', 'There is no such class on this day');
    });
    expect(result.sent).toBe(1);
    expect(result.dropped.map((entry) => [entry.item.slotId, entry.message])).toEqual([[5, 'There is no such class on this day']]);
    expect(await readOutbox(store)).toEqual([]);
  });

  it('does nothing and writes nothing when there is nothing to send', async () => {
    const store = memory();
    const send = vi.fn();
    expect(await flushOutbox(store, send)).toEqual({ sent: 0, dropped: [], left: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends each mark once even when two screens flush at the same time', async () => {
    const store = memory();
    await queueMark(store, { timetableId: 1, date: '2026-11-03', slotId: 5, mark: absent });
    const send = vi.fn(async () => {});
    await Promise.all([flushOutbox(store, send), flushOutbox(store, send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
