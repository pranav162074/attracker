import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { problemFrom } from './lib/forms.ts';
import { flushOutbox, loadWithCache } from './lib/offline.ts';
import type { QueuedMark } from './lib/offline.ts';
import { api } from './session.tsx';
import { storage } from './storage.ts';

type LoadState<T> = { data: T | null; error: string | null; refreshing: boolean; savedAt: string | null };

export const sendQueuedMark = (item: QueuedMark) => api.mark(item.timetableId, item.date, item.slotId, item.mark);

export const useLoad = <T, U = T>(load: () => Promise<T>, cacheKey?: string, finish?: (data: T) => Promise<U>, follow?: unknown) => {
  const [state, setState] = useState<LoadState<U>>({ data: null, error: null, refreshing: false, savedAt: null });

  const fetchNow = useCallback(async () => {
    try {
      await flushOutbox(storage, sendQueuedMark).catch(() => null);
      const { data, savedAt } = cacheKey ? await loadWithCache(storage, cacheKey, load) : { data: await load(), savedAt: null };
      const finished = finish ? await finish(data) : (data as unknown as U);
      setState({ data: finished, error: null, refreshing: false, savedAt });
    } catch (error) {
      setState((current) => ({ ...current, error: problemFrom(error).message ?? 'Could not load this.', refreshing: false }));
    }
  }, [load, cacheKey, finish]);

  const following = follow !== undefined;

  useFocusEffect(
    useCallback(() => {
      if (!following) fetchNow();
    }, [fetchNow, following])
  );

  useEffect(() => {
    if (following) fetchNow();
  }, [fetchNow, following, follow]);

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, refreshing: true }));
    fetchNow();
  }, [fetchNow]);

  return { ...state, loading: state.data === null && state.error === null, refresh };
};
