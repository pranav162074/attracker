import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { env } from '../src/config/env.ts';
import { pool, query, closePool } from '../src/db/pool.ts';
import { googleCerts } from '../src/auth/google.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';

const WEB = 'test-web.apps.googleusercontent.com';
const ANDROID = 'test-android.apps.googleusercontent.com';
const run = randomUUID().slice(0, 8);
const emails: string[] = [];
const subjects: string[] = [];
let ipCounter = 0;

const keyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
};
const google = keyPair();
const forger = keyPair();

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

const idToken = (
  claims: Record<string, unknown> = {},
  { key = google.privateKey, kid = 'google-key-1' }: { key?: typeof google.privateKey; kid?: string } = {}
) => {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', kid, typ: 'JWT' });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: WEB,
    iat: now - 10,
    exp: now + 3600,
    email_verified: true,
    ...claims,
  });
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key).toString('base64url');
  return `${header}.${payload}.${signature}`;
};

const person = () => {
  const email = `google-${run}-${randomUUID().slice(0, 8)}@gmail.com`;
  const sub = `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  emails.push(email);
  subjects.push(sub);
  return { email, sub };
};

const freshIp = () => {
  ipCounter += 1;
  return `10.252.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

const continueWithGoogle = (token: string, client: 'web' | 'app' = 'app') =>
  request(app).post('/auth/google').set('X-Forwarded-For', freshIp()).send({ idToken: token, client });

beforeEach(() => {
  vi.spyOn(googleCerts, 'fetch').mockResolvedValue({ 'google-key-1': google.publicPem });
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (databaseReady) {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    await pool.query("DELETE FROM rate_limit_windows WHERE key LIKE '10.252.%' OR key = ANY($1::text[])", [emails]);
  }
  await closePool();
});

describe.skipIf(skipWithoutDatabase)('continue with Google', () => {
  it('creates an account without a password on first use, and logs the app in', async () => {
    const { email, sub } = person();
    const res = await continueWithGoogle(idToken({ sub, email }));

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.token).toMatch(/^at_/);

    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.user.signInMethods).toEqual(['google']);
    const rows = await query<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(rows[0]!.password_hash).toBeNull();
  });

  it('logs the same Google account into the same user every time, by cookie on the web', async () => {
    const { email, sub } = person();
    const first = await continueWithGoogle(idToken({ sub, email }));
    const again = await continueWithGoogle(idToken({ sub, email }), 'web');

    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(first.body.user.id);
    expect(String(again.headers['set-cookie'])).toMatch(/^attracker_session=at_/);
  });

  it('joins an existing password account with the same email, and both ways keep working', async () => {
    const { email, sub } = person();
    const signup = await request(app)
      .post('/auth/signup')
      .set('X-Forwarded-For', freshIp())
      .send({ email, password: 'correct horse battery', client: 'app' });

    const res = await continueWithGoogle(idToken({ sub, email: email.toUpperCase() }));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(signup.body.user.id);

    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.user.signInMethods).toEqual(['password', 'google']);
    const login = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', freshIp())
      .send({ email, password: 'correct horse battery' });
    expect(login.status).toBe(200);
  });

  it('accepts tokens issued for the Android app too', async () => {
    const { email, sub } = person();
    expect((await continueWithGoogle(idToken({ sub, email, aud: ANDROID }))).status).toBe(201);
  });

  it('refuses tokens that are forged, expired, for another app, or from another issuer', async () => {
    const { email, sub } = person();
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      idToken({ sub, email }, { key: forger.privateKey }),
      idToken({ sub, email }, { kid: 'unknown-key' }),
      idToken({ sub, email, iat: now - 7200, exp: now - 3600 }),
      idToken({ sub, email, aud: 'someone-else.apps.googleusercontent.com' }),
      idToken({ sub, email, iss: 'https://evil.example' }),
      `${idToken({ sub, email }).split('.').slice(0, 2).join('.')}.${'A'.repeat(342)}`,
    ];
    const tampered = idToken({ sub, email }).split('.');
    tampered[1] = encode({ ...JSON.parse(Buffer.from(tampered[1]!, 'base64url').toString()), email: 'victim@example.com' });
    bad.push(tampered.join('.'));

    for (const token of bad) {
      const res = await continueWithGoogle(token);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_google_token');
    }
    const rows = await query('SELECT 1 FROM users WHERE email = ANY($1::text[])', [[email, 'victim@example.com']]);
    expect(rows).toHaveLength(0);
  });

  it('refuses Google accounts without a verified email', async () => {
    const { email, sub } = person();
    const res = await continueWithGoogle(idToken({ sub, email, email_verified: false }));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('google_email_unverified');
    expect(await query('SELECT 1 FROM users WHERE email = $1', [email])).toHaveLength(0);
  });

  it('does not let anyone log into a Google-only account with a password', async () => {
    const { email, sub } = person();
    await continueWithGoogle(idToken({ sub, email }));
    for (const password of ['', 'null', 'disabled', 'correct horse battery']) {
      const res = await request(app).post('/auth/login').set('X-Forwarded-For', freshIp()).send({ email, password: password || 'x' });
      expect(res.status).toBe(401);
    }
  });

  it('refuses a second, different Google account for the same email', async () => {
    const { email, sub } = person();
    await continueWithGoogle(idToken({ sub, email }));
    const other = `${sub}9`;
    subjects.push(other);
    const res = await continueWithGoogle(idToken({ sub: other, email }));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('google_account_mismatch');
  });

  it('creates exactly one account when the first sign-in arrives several times at once', async () => {
    const { email, sub } = person();
    const results = await Promise.all(Array.from({ length: 6 }, () => continueWithGoogle(idToken({ sub, email }))));
    expect(results.every((res) => res.status === 200 || res.status === 201)).toBe(true);
    expect(new Set(results.map((res) => res.body.user.id)).size).toBe(1);
    const users = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    const identities = await query("SELECT 1 FROM user_identities WHERE provider = 'google' AND subject = $1", [sub]);
    expect(users).toHaveLength(1);
    expect(identities).toHaveLength(1);
  });

  it('checks the request and says when Google sign-in is not set up', async () => {
    const missing = await request(app).post('/auth/google').set('X-Forwarded-For', freshIp()).send({ client: 'app' });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe('idToken is required');

    const configured = env.googleClientIds;
    (env as { googleClientIds: string[] }).googleClientIds = [];
    try {
      const { email, sub } = person();
      const res = await continueWithGoogle(idToken({ sub, email }));
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('google_disabled');
    } finally {
      (env as { googleClientIds: string[] }).googleClientIds = configured;
    }
  });
});

describe.skipIf(skipWithoutDatabase)('sign-in methods', () => {
  it('lists only password for an email account', async () => {
    const email = `methods-${run}@example.com`;
    emails.push(email);
    const signup = await request(app)
      .post('/auth/signup')
      .set('X-Forwarded-For', freshIp())
      .send({ email, password: 'correct horse battery', client: 'app' });
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${signup.body.token}`);
    expect(me.body.user.signInMethods).toEqual(['password']);
  });
});
