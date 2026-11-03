import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValue } from './lib/offline.ts';

export const storage: KeyValue = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (keys) => AsyncStorage.multiRemove([...keys]),
  keys: () => AsyncStorage.getAllKeys(),
};
