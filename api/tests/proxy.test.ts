import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { env } from '../src/config/env.ts';
import { CLIENT_IP_HEADER, fromProxy, PROXY_HEADER } from '../src/middleware/proxy.ts';

const SECRET = 'a-test-secret-that-is-long-enough-1234';

const probe = express();
probe.use(fromProxy);
probe.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
probe.get('/whoami', (req, res) => {
  res.json({ ip: req.ip });
});

afterEach(() => {
  Object.assign(env, { proxySecret: '' });
});

describe('requests through the website forwarder', () => {
  it('lets everything through when no secret is set, as in development', async () => {
    const res = await request(probe).get('/whoami').set(CLIENT_IP_HEADER, '203.0.113.9');
    expect(res.status).toBe(200);
    expect(res.body.ip).not.toBe('203.0.113.9');
  });

  it('refuses requests that skip the forwarder once a secret is set', async () => {
    Object.assign(env, { proxySecret: SECRET });
    const missing = await request(probe).get('/whoami');
    expect(missing.status).toBe(403);
    expect(missing.body.error).toBe('forbidden');
    const wrong = await request(probe).get('/whoami').set(PROXY_HEADER, `${SECRET}x`);
    expect(wrong.status).toBe(403);
  });

  it('still answers health checks from the host', async () => {
    Object.assign(env, { proxySecret: SECRET });
    expect((await request(probe).get('/health')).status).toBe(200);
  });

  it('uses the visitor address the forwarder passes on, so limits count each person', async () => {
    Object.assign(env, { proxySecret: SECRET });
    const res = await request(probe).get('/whoami').set(PROXY_HEADER, SECRET).set(CLIENT_IP_HEADER, '203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
    const v6 = await request(probe).get('/whoami').set(PROXY_HEADER, SECRET).set(CLIENT_IP_HEADER, '2001:db8::1');
    expect(v6.body.ip).toBe('2001:db8::1');
    const junk = await request(probe).get('/whoami').set(PROXY_HEADER, SECRET).set(CLIENT_IP_HEADER, 'not-an-address');
    expect(junk.body.ip).not.toBe('not-an-address');
  });
});
