import { useSyncExternalStore } from 'react';

let waking = false;
const listeners = new Set<() => void>();

export const setWaking = (value: boolean) => {
  if (waking === value) return;
  waking = value;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useWaking = () => useSyncExternalStore(subscribe, () => waking, () => waking);
