import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiUrl } from './lib/apiUrl.ts';
import type { ApiMode } from './lib/api.ts';

export const apiUrl = resolveApiUrl({
  configured: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
  dev: __DEV__,
  hostUri: Constants.expoConfig?.hostUri,
});

export const apiMode: ApiMode = Platform.OS === 'web' ? 'cookie' : 'token';
