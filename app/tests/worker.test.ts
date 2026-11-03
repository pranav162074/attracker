import { describe, it, expect, vi } from 'vitest';
import { forward, isApiPath } from '../worker/forward.ts';

const ENV = { API_ORIGIN: 'https://attracker-api.onrender.com', PROXY_SECRET: 'secret-from-settings' };

const capture = () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const send = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'attracker_session=at_x; Path=/; HttpOnly' } });
  });
  return { send: send as unknown as typeof fetch, calls };
};

describe('the website forwarder', () => {
  it('only takes /api paths', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/auth/me')).toBe(true);
    expect(isApiPath('/apiary')).toBe(false);
    expect(isApiPath('/timetables/3')).toBe(false);
  });

  it('sends the request on to the API without /api, with the secret and the visitor address', async () => {
    const { send, calls } = capture();
    const request = new Request('https://attracker.example.workers.dev/api/auth/login?x=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attracker.example.workers.dev', cookie: 'attracker_session=at_old', 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify({ email: 'asha@example.com' }),
    });
    const res = await forward(request, ENV, send);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('attracker_session=at_x');
    expect(calls[0]!.url).toBe('https://attracker-api.onrender.com/auth/login?x=1');
    const headers = calls[0]!.init.headers as Headers;
    expect(headers.get('x-attracker-proxy')).toBe('secret-from-settings');
    expect(headers.get('x-attracker-client-ip')).toBe('203.0.113.9');
    expect(headers.get('origin')).toBe('https://attracker.example.workers.dev');
    expect(headers.get('cookie')).toBe('attracker_session=at_old');
    expect(headers.get('host')).toBeNull();
    expect(new TextDecoder().decode(calls[0]!.init.body as ArrayBuffer)).toBe('{"email":"asha@example.com"}');
    expect(calls[0]!.init.redirect).toBe('manual');
  });

  it('does not let a visitor fake the secret or their address', async () => {
    const { send, calls } = capture();
    await forward(new Request('https://site.example/api/today', { headers: { 'x-attracker-proxy': 'guess', 'x-attracker-client-ip': '1.2.3.4' } }), ENV, send);
    const headers = calls[0]!.init.headers as Headers;
    expect(headers.get('x-attracker-proxy')).toBe('secret-from-settings');
    expect(headers.get('x-attracker-client-ip')).toBeNull();
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it('says so plainly when it is not set up or the server is down', async () => {
    const missing = await forward(new Request('https://site.example/api/today'), { API_ORIGIN: '', PROXY_SECRET: '' });
    expect(missing.status).toBe(503);
    const down = await forward(new Request('https://site.example/api/today'), ENV, (async () => Promise.reject(new TypeError('fetch failed'))) as typeof fetch);
    expect(down.status).toBe(502);
    expect((await down.json()).error).toBe('server_unreachable');
  });
});
