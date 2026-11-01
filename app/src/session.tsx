import { createContext, use, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { apiMode, apiUrl } from './config.ts';
import { createApi } from './lib/api.ts';
import type { Api } from './lib/api.ts';
import { acceptAuth, endSession, restoreSession } from './lib/session.ts';
import type { SessionState, TokenHolder } from './lib/session.ts';
import { tokenStore } from './tokenStore';

const holder: TokenHolder = { current: null };
let onSessionLost = () => {};

export const api: Api = createApi({
  baseUrl: apiUrl ?? '',
  mode: apiMode,
  getToken: () => holder.current,
  onUnauthorized: () => {
    holder.current = null;
    tokenStore.clear().catch(() => {});
    onSessionLost();
  },
});

type SessionValue = {
  state: SessionState;
  logIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  retry: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export const useSession = () => {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
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
    restoreSession(api, tokenStore, holder, apiMode === 'token').then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const value: SessionValue = {
    state,
    logIn: async (email, password) => setState(await acceptAuth(await api.login(email, password), tokenStore, holder)),
    signUp: async (email, password) => setState(await acceptAuth(await api.signup(email, password), tokenStore, holder)),
    logOut: async () => setState(await endSession(api, tokenStore, holder)),
    retry: () => {
      setState({ status: 'loading' });
      setAttempt((count) => count + 1);
    },
  };

  return <SessionContext value={value}>{children}</SessionContext>;
};
