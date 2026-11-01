import { describe, it, expect, vi } from 'vitest';
import { ApiError, NetworkError } from '../src/lib/api.ts';
import type { Api, User } from '../src/lib/api.ts';
import { acceptAuth, endSession, restoreSession } from '../src/lib/session.ts';
import type { TokenStore } from '../src/lib/session.ts';

const USER: User = { id: 1, email: 'asha@example.com', createdAt: '2026-11-01T00:00:00.000Z' };

const memoryStore = (initial: string | null = null) => {
  let value = initial;
  const store: TokenStore & { value: () => string | null } = {
    read: async () => value,
    save: async (token) => {
      value = token;
    },
    clear: async () => {
      value = null;
    },
    value: () => value,
  };
  return store;
};

const fakeApi = (me: () => Promise<User>, logout: () => Promise<void> = async () => {}) => ({ me: vi.fn(me), logout: vi.fn(logout) }) as unknown as Api;

describe('restoring a session when the app opens', () => {
  it('goes straight to the login screen on a phone with no saved token', async () => {
    const api = fakeApi(async () => USER);
    const holder = { current: null };
    expect(await restoreSession(api, memoryStore(), holder, true)).toEqual({ status: 'signedOut' });
    expect(api.me).not.toHaveBeenCalled();
  });

  it('signs in with a saved token that still works', async () => {
    const holder = { current: null as string | null };
    const state = await restoreSession(fakeApi(async () => USER), memoryStore('at_saved'), holder, true);
    expect(state).toEqual({ status: 'signedIn', user: USER });
    expect(holder.current).toBe('at_saved');
  });

  it('forgets a token the server no longer accepts', async () => {
    const store = memoryStore('at_old');
    const holder = { current: null as string | null };
    const state = await restoreSession(fakeApi(async () => Promise.reject(new ApiError(401, 'unauthorized', 'Log in to continue'))), store, holder, true);
    expect(state).toEqual({ status: 'signedOut' });
    expect(store.value()).toBeNull();
    expect(holder.current).toBeNull();
  });

  it('keeps the token when the server cannot be reached, so a retry can still work', async () => {
    const store = memoryStore('at_saved');
    const state = await restoreSession(fakeApi(async () => Promise.reject(new NetworkError())), store, { current: null }, true);
    expect(state.status).toBe('unreachable');
    expect(store.value()).toBe('at_saved');
  });

  it('asks the server on the web, where the cookie is invisible to the app', async () => {
    const api = fakeApi(async () => USER);
    expect(await restoreSession(api, memoryStore(), { current: null }, false)).toEqual({ status: 'signedIn', user: USER });
    expect(api.me).toHaveBeenCalledOnce();
  });
});

describe('logging in and out', () => {
  it('saves the token from a phone login', async () => {
    const store = memoryStore();
    const holder = { current: null as string | null };
    const state = await acceptAuth({ user: USER, token: 'at_new', expiresAt: '2027-01-01T00:00:00.000Z' }, store, holder);
    expect(state).toEqual({ status: 'signedIn', user: USER });
    expect(store.value()).toBe('at_new');
    expect(holder.current).toBe('at_new');
  });

  it('logs out locally even when the server cannot be told', async () => {
    const store = memoryStore('at_saved');
    const holder = { current: 'at_saved' as string | null };
    const api = fakeApi(async () => USER, async () => Promise.reject(new NetworkError()));
    expect(await endSession(api, store, holder)).toEqual({ status: 'signedOut' });
    expect(store.value()).toBeNull();
    expect(holder.current).toBeNull();
  });
});
