import * as SecureStore from 'expo-secure-store';

const key = (name: string) => `attracker.pref.${name}`;

export const prefs = {
  read: (name: string) => SecureStore.getItemAsync(key(name)).catch(() => null),
  save: (name: string, value: string) => SecureStore.setItemAsync(key(name), value).catch(() => {}),
};
