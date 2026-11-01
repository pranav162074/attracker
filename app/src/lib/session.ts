import { ApiError } from './api.ts';
import type { Api, AuthResult, User } from './api.ts';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User }
  | { status: 'unreachable'; message: string };

export type TokenStore = {
  read: () => Promise<string | null>;
  save: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

export type TokenHolder = { current: string | null };

export const restoreSession = async (api: Api, tokens: TokenStore, holder: TokenHolder, usesTokens: boolean): Promise<SessionState> => {
  if (usesTokens) {
    holder.current = await tokens.read().catch(() => null);
    if (!holder.current) return { status: 'signedOut' };
  }
  try {
    return { status: 'signedIn', user: await api.me() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      holder.current = null;
      await tokens.clear().catch(() => {});
      return { status: 'signedOut' };
    }
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return { status: 'unreachable', message };
  }
};

export const acceptAuth = async (result: AuthResult, tokens: TokenStore, holder: TokenHolder): Promise<SessionState> => {
  if (result.token) {
    holder.current = result.token;
    await tokens.save(result.token);
  }
  return { status: 'signedIn', user: result.user };
};

export const endSession = async (api: Api, tokens: TokenStore, holder: TokenHolder): Promise<SessionState> => {
  await api.logout().catch(() => {});
  holder.current = null;
  await tokens.clear().catch(() => {});
  return { status: 'signedOut' };
};
