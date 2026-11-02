import { describe, it, expect, vi } from 'vitest';
import { ApiError, createApi, NetworkError } from '../src/lib/api.ts';

type Call = { url: string; init: RequestInit };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const fakeFetch = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  });
  return { fn: fn as unknown as typeof fetch, calls };
};

const USER = { id: 1, email: 'asha@example.com', createdAt: '2026-11-01T00:00:00.000Z' };

describe('the API client', () => {
  it('logs in from the phone with a token and sends it afterwards', async () => {
    let token: string | null = null;
    const { fn, calls } = fakeFetch(({ url }) =>
      url.endsWith('/auth/login') ? json(200, { user: USER, token: 'at_abc', expiresAt: '2027-01-01T00:00:00.000Z' }) : json(200, { user: USER })
    );
    const api = createApi({ baseUrl: 'http://192.168.1.5:4000/', mode: 'token', getToken: () => token, fetch: fn });

    const result = await api.login('asha@example.com', 'secret123');
    expect(result.token).toBe('at_abc');
    expect(calls[0]!.url).toBe('http://192.168.1.5:4000/auth/login');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ email: 'asha@example.com', password: 'secret123', client: 'app' });
    expect(calls[0]!.init.credentials).toBe('omit');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();

    token = 'at_abc';
    expect(await api.me()).toEqual(USER);
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe('Bearer at_abc');
    expect(calls[1]!.init.body).toBeUndefined();
  });

  it('uses the cookie on the web and never sends a bearer token', async () => {
    const { fn, calls } = fakeFetch(() => json(201, { user: USER, expiresAt: '2027-01-01T00:00:00.000Z' }));
    const api = createApi({ baseUrl: '/api', mode: 'cookie', getToken: () => 'at_should_not_be_sent', fetch: fn });

    await api.signup('asha@example.com', 'secret123');
    expect(calls[0]!.url).toBe('/api/auth/signup');
    expect(calls[0]!.init.credentials).toBe('include');
    expect(JSON.parse(calls[0]!.init.body as string).client).toBe('web');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('turns validation errors into messages per field', async () => {
    const { fn } = fakeFetch(() =>
      json(400, {
        error: 'validation_error',
        message: 'Enter a valid email address',
        details: [
          { field: 'email', message: 'Enter a valid email address' },
          { field: 'email', message: 'A second message for the same field' },
          { field: 'password', message: 'Password must be at least 8 characters' },
          { field: null, message: 'Not tied to a field' },
        ],
      })
    );
    const api = createApi({ baseUrl: 'http://x', mode: 'token', fetch: fn });
    const error = await api.signup('bad', 'short').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).code).toBe('validation_error');
    expect((error as ApiError).fields).toEqual({ email: 'Enter a valid email address', password: 'Password must be at least 8 characters' });
  });

  it('reports a wrong password without treating it as a lost session', async () => {
    const onUnauthorized = vi.fn();
    const { fn } = fakeFetch(() => json(401, { error: 'invalid_credentials', message: 'Email or password is incorrect' }));
    const api = createApi({ baseUrl: 'http://x', mode: 'token', fetch: fn, onUnauthorized });
    await expect(api.login('asha@example.com', 'wrong')).rejects.toMatchObject({ status: 401, message: 'Email or password is incorrect' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('tells the app when a session has expired', async () => {
    const onUnauthorized = vi.fn();
    const { fn } = fakeFetch(() => json(401, { error: 'unauthorized', message: 'Log in to continue' }));
    const api = createApi({ baseUrl: 'http://x', mode: 'token', getToken: () => 'at_old', fetch: fn, onUnauthorized });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('fetches the home screen lists', async () => {
    const { fn, calls } = fakeFetch(({ url }) => (url.endsWith('/overview') ? json(200, { timetables: [{ timetableId: 3 }] }) : json(200, { classes: [{ key: 'slot:1' }] })));
    const api = createApi({ baseUrl: 'http://x', mode: 'token', getToken: () => 'at_abc', fetch: fn });
    expect(await api.overview()).toEqual([{ timetableId: 3 }]);
    expect(await api.today()).toEqual([{ key: 'slot:1' }]);
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', 'http://x/overview'],
      ['GET', 'http://x/today'],
    ]);
  });

  it('sends timetable and subject changes to the right places', async () => {
    const { fn, calls } = fakeFetch(({ init }) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return json(200, { timetable: { id: 7 }, subject: { id: 9 }, subjects: [{ id: 9 }], status: 'setup', ready: false, steps: [] });
    });
    const api = createApi({ baseUrl: 'http://x', mode: 'token', getToken: () => 'at_abc', fetch: fn });
    const input = { name: 'Dance', startsOn: '2026-09-01', endsOn: null, requiredPercent: null, condonationPercent: null };
    const subject = { name: 'Kuchipudi', shortName: null, kind: 'theory' as const, countsAttendance: true, countPerSession: false, colour: null };

    expect(await api.createTimetable(input)).toEqual({ id: 7 });
    await api.updateTimetable(7, { name: 'Dance class' });
    await api.setup(7);
    await api.startTracking(7);
    expect(await api.subjects(7, true)).toEqual([{ id: 9 }]);
    await api.subjects(7);
    expect(await api.createSubject(7, subject)).toEqual({ id: 9 });
    await api.updateSubject(7, 9, { archived: true });
    await api.deleteSubject(7, 9);
    await api.deleteTimetable(7);

    expect(calls.map((call) => `${call.init.method} ${call.url.replace('http://x', '')}`)).toEqual([
      'POST /timetables',
      'PATCH /timetables/7',
      'GET /timetables/7/setup',
      'POST /timetables/7/start',
      'GET /timetables/7/subjects?archived=true',
      'GET /timetables/7/subjects',
      'POST /timetables/7/subjects',
      'PATCH /timetables/7/subjects/9',
      'DELETE /timetables/7/subjects/9',
      'DELETE /timetables/7',
    ]);
    expect(JSON.parse(calls[7]!.init.body as string)).toEqual({ archived: true });
  });

  it('accepts an empty 204 response', async () => {
    const { fn } = fakeFetch(() => new Response(null, { status: 204 }));
    const api = createApi({ baseUrl: 'http://x', mode: 'token', getToken: () => 'at_abc', fetch: fn });
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it('gives a plain message when the server fails without JSON', async () => {
    const { fn } = fakeFetch(() => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
    const api = createApi({ baseUrl: 'http://x', mode: 'token', fetch: fn });
    await expect(api.me()).rejects.toMatchObject({ status: 502, code: 'http_error', message: 'Something went wrong on our side. Try again in a minute.' });
  });

  it('reports a network failure as such', async () => {
    const fn = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const api = createApi({ baseUrl: 'http://x', mode: 'token', fetch: fn });
    await expect(api.me()).rejects.toBeInstanceOf(NetworkError);
  });

  it('gives up on a server that never answers', async () => {
    const fn = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const api = createApi({ baseUrl: 'http://x', mode: 'token', fetch: fn, timeoutMs: 30 });
    await expect(api.me()).rejects.toBeInstanceOf(NetworkError);
  });
});
