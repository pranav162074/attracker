import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { pool, closePool } from '../src/db/pool.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';
import { createdEmails, freshIp, testIpPrefix } from './helpers.ts';

afterAll(async () => {
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [createdEmails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1', [`${testIpPrefix}%`]);
  }
  await closePool();
});

const WEB = 'http://localhost:8081';

describe('cross-origin requests from the web app', () => {
  it('answers a preflight from an allowed origin', async () => {
    const res = await request(app)
      .options('/auth/login')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    expect(res.headers.vary).toContain('Origin');
  });

  it('allows an allowed origin to read ordinary responses', async () => {
    const res = await request(app).get('/health').set('Origin', WEB);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['access-control-expose-headers']).toBe('X-Request-Id');
  });

  it('gives nothing to other origins', async () => {
    const preflight = await request(app)
      .options('/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();

    const plain = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(plain.headers['access-control-allow-origin']).toBeUndefined();
    expect(plain.headers.vary).toContain('Origin');
  });

  it('adds nothing when there is no Origin, as with the phone app', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.skipIf(skipWithoutDatabase)('lets the web app sign up and then use its cookie', async () => {
    const email = `cors-${randomUUID()}@example.com`;
    createdEmails.push(email);
    const signup = await request(app)
      .post('/auth/signup')
      .set('Origin', WEB)
      .set('X-Forwarded-For', freshIp())
      .send({ email, password: 'correct horse battery', client: 'web' });
    expect(signup.status).toBe(201);
    expect(signup.headers['access-control-allow-origin']).toBe(WEB);
    const cookie = signup.headers['set-cookie'];
    expect(cookie).toBeDefined();

    const me = await request(app).get('/auth/me').set('Origin', WEB).set('Cookie', cookie!);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);

    const logout = await request(app).post('/auth/logout').set('Origin', WEB).set('Cookie', cookie!);
    expect(logout.status).toBe(204);
  });
});
