import * as SecureStore from 'expo-secure-store';

const KEY = 'attracker.session';

export const tokenStore = {
  read: () => SecureStore.getItemAsync(KEY),
  save: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
