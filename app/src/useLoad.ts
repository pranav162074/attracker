import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { problemFrom } from './lib/forms.ts';

type LoadState<T> = { data: T | null; error: string | null; refreshing: boolean };

export const useLoad = <T>(load: () => Promise<T>) => {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, refreshing: false });

  const fetchNow = useCallback(async () => {
    try {
      const data = await load();
      setState({ data, error: null, refreshing: false });
    } catch (error) {
      setState((current) => ({ ...current, error: problemFrom(error).message ?? 'Could not load this.', refreshing: false }));
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      fetchNow();
    }, [fetchNow])
  );

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, refreshing: true }));
    fetchNow();
  }, [fetchNow]);

  return { ...state, loading: state.data === null && state.error === null, refresh };
};
