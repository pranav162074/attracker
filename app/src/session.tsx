import { createContext, use, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { apiMode, apiUrl } from './config.ts';
import { createApi } from './lib/api.ts';
import type { Api } from './lib/api.ts';
import { acceptAuth, endSession, restoreSession } from './lib/session.ts';
import type { SessionState, TokenHolder } from './lib/session.ts';
import { forgetEverything, rememberUser, rememberedUser } from './lib/offline.ts';
import type { User } from './lib/api.ts';
import { storage } from './storage.ts';
import { tokenStore } from './tokenStore';
import { setWaking } from './waking.ts';

const holder: TokenHolder = { current: null };
let onSessionLost = () => {};

export const api: Api = createApi({
  baseUrl: apiUrl ?? '',
  mode: apiMode,
  getToken: () => holder.current,
  onWaiting: setWaking,
  onUnauthorized: () => {
    holder.current = null;
    tokenStore.clear().catch(() => {});
    forgetEverything(storage);
    onSessionLost();
  },
});

type SessionValue = {
  state: SessionState;
  logIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  retry: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export const useSession = () => {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
};

const signedIn = async (next: SessionState) => {
  await forgetEverything(storage);
  if (next.status === 'signedIn') await rememberUser(storage, next.user);
  return next;
};

const MISSING_URL = 'The app does not know where the attracker server is. Set EXPO_PUBLIC_API_URL.';

export const SessionProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<SessionState>(apiUrl ? { status: 'loading' } : { status: 'unreachable', message: MISSING_URL });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onSessionLost = () => setState({ status: 'signedOut' });
    return () => {
      onSessionLost = () => {};
    };
  }, []);

  useEffect(() => {
    if (!apiUrl) return;
    let active = true;
    restoreSession(api, tokenStore, holder, apiMode === 'token', () => rememberedUser<User>(storage)).then((next) => {
      if (next.status === 'signedIn') rememberUser(storage, next.user);
      if (next.status === 'signedOut') forgetEverything(storage);
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const value: SessionValue = {
    state,
    logIn: async (email, password) => setState(await signedIn(await acceptAuth(await api.login(email, password), tokenStore, holder))),
    signUp: async (email, password) => setState(await signedIn(await acceptAuth(await api.signup(email, password), tokenStore, holder))),
    resetPassword: async (email, code, password) => setState(await signedIn(await acceptAuth(await api.resetPassword(email, code, password), tokenStore, holder))),
    logOut: async () => {
      const next = await endSession(api, tokenStore, holder);
      await forgetEverything(storage);
      setState(next);
    },
    retry: () => {
      setState({ status: 'loading' });
      setAttempt((count) => count + 1);
    },
  };

  return <SessionContext value={value}>{children}</SessionContext>;
};
