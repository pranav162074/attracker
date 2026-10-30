import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { pool, query, closePool } from '../src/db/pool.ts';
import { hashPassword, verifyPassword, PASSWORD_PARAMS } from '../src/auth/password.ts';
import { hashToken } from '../src/auth/tokens.ts';
import { LIMITS } from '../src/routes/auth.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';

const ORIGIN = 'http://localhost:8081';
const PASSWORD = 'correct horse battery';
const emails: string[] = [];
const run = randomUUID().slice(0, 8);
let ipCounter = 0;

const freshIp = () => {
  ipCounter += 1;
  return `10.${(parseInt(run.slice(0, 2), 16) % 250) + 1}.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

const freshEmail = () => {
  const email = `auth-${run}-${randomUUID().slice(0, 8)}@example.com`;
  emails.push(email);
  return email;
};

const signup = (body: Record<string, unknown>, ip = freshIp()) =>
  request(app).post('/auth/signup').set('X-Forwarded-For', ip).send(body);

const login = (body: Record<string, unknown>, ip = freshIp()) =>
  request(app).post('/auth/login').set('X-Forwarded-For', ip).send(body);

const cookieFrom = (res: request.Response) => {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((value) => value.startsWith('attracker_session='));
};

const appUser = async () => {
  const email = freshEmail();
  const res = await signup({ email, password: PASSWORD, client: 'app' });
  expect(res.status).toBe(201);
  return { email, token: res.body.token as string, id: res.body.user.id as number };
};

afterAll(async () => {
  if (databaseReady) {
    if (emails.length > 0) await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1 OR key = ANY($2::text[])', [`10.${(parseInt(run.slice(0, 2), 16) % 250) + 1}.%`, emails]);
  }
  await closePool();
});

describe('passwords', () => {
  it('are stored as salted scrypt hashes with their parameters', async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored).toMatch(new RegExp(`^scrypt\\$${PASSWORD_PARAMS.N}\\$8\\$1\\$[\\w-]{22}\\$[\\w-]{43}$`));
    expect(stored).not.toContain(PASSWORD);
    expect(await hashPassword(PASSWORD)).not.toBe(stored);
  });

  it('verify only the right password, and survive junk in the database', async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}!`, stored)).toBe(false);
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(await verifyPassword(PASSWORD, 'plain-text')).toBe(false);
    expect(await verifyPassword(PASSWORD, stored.replace(`$${PASSWORD_PARAMS.N}$`, '$1073741824$'))).toBe(false);
  });

  it('treat the same characters typed differently as the same password', async () => {
    const stored = await hashPassword('café au lait');
    expect(await verifyPassword('café au lait', stored)).toBe(true);
  });

  it('keep working for hashes made with older, cheaper settings', async () => {
    const old = await hashPassword(PASSWORD, { N: 16384, r: 8, p: 1 });
    expect(await verifyPassword(PASSWORD, old)).toBe(true);
  });
});

describe.skipIf(skipWithoutDatabase)('signing up', () => {
  it('creates the account and logs the website in with a secure cookie', async () => {
    const email = freshEmail();
    const res = await signup({ email: `  ${email.toUpperCase()} `, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, id: expect.any(Number) });
    expect(res.body.token).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = cookieFrom(res);
    expect(cookie).toMatch(/^attracker_session=at_[\w-]{43};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('gives the phone app a token instead of a cookie', async () => {
    const res = await signup({ email: freshEmail(), password: PASSWORD, client: 'app' });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^at_[\w-]{43}$/);
    expect(cookieFrom(res)).toBeUndefined();
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);
  });

  it('stores only a hash of the session token, never the token', async () => {
    const { token, id } = await appUser();
    const rows = await query<{ token_hash: Buffer }>('SELECT token_hash FROM sessions WHERE user_id = $1', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash.equals(hashToken(token))).toBe(true);
    const { rows: leaked } = await pool.query("SELECT 1 FROM sessions WHERE encode(token_hash, 'escape') LIKE '%' || $1 || '%'", [token.slice(3, 20)]);
    expect(leaked).toHaveLength(0);
  });

  it('refuses an email that is already registered, in any case', async () => {
    const email = freshEmail();
    expect((await signup({ email, password: PASSWORD })).status).toBe(201);
    const again = await signup({ email: email.toUpperCase(), password: PASSWORD });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('email_taken');
  });

  it('explains what is wrong with the email or password', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ email: 'not-an-email', password: PASSWORD }, 'Enter a valid email address'],
      [{ email: freshEmail(), password: 'short' }, 'Password must be at least 8 characters'],
      [{ email: freshEmail(), password: '         ' }, 'Password cannot be only spaces'],
      [{ email: freshEmail(), password: 'x'.repeat(129) }, 'Password must be at most 128 characters'],
      [{ password: PASSWORD }, 'Enter your email'],
      [{ email: freshEmail(), password: PASSWORD, admin: true }, 'Unrecognized key: "admin"'],
    ];
    for (const [body, message] of cases) {
      const res = await signup(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe('validation_error');
      expect(res.body.message).toBe(message);
    }
  });
});

describe.skipIf(skipWithoutDatabase)('logging in', () => {
  it('works with the right password, for the website and for the app', async () => {
    const email = freshEmail();
    await signup({ email, password: PASSWORD });

    const web = await login({ email, password: PASSWORD });
    expect(web.status).toBe(200);
    expect(cookieFrom(web)).toBeDefined();

    const phone = await login({ email: email.toUpperCase(), password: PASSWORD, client: 'app' });
    expect(phone.status).toBe(200);
    expect(phone.body.token).toMatch(/^at_/);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const email = freshEmail();
    await signup({ email, password: PASSWORD });
    const wrong = await login({ email, password: 'not the password' });
    const unknown = await login({ email: freshEmail(), password: PASSWORD });

    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_credentials', message: 'Email or password is incorrect' });
      expect(cookieFrom(res)).toBeUndefined();
    }
  });
});

describe.skipIf(skipWithoutDatabase)('sessions', () => {
  it('identify the user by cookie or by bearer token', async () => {
    const email = freshEmail();
    const web = await signup({ email, password: PASSWORD });
    const cookie = cookieFrom(web)!.split(';')[0]!;
    const phone = await login({ email, password: PASSWORD, client: 'app' });

    const byCookie = await request(app).get('/auth/me').set('Cookie', cookie);
    const byToken = await request(app).get('/auth/me').set('Authorization', `Bearer ${phone.body.token}`);
    for (const res of [byCookie, byToken]) {
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('reject missing, malformed, made-up and expired tokens', async () => {
    const { token, id } = await appUser();
    const made = `at_${'A'.repeat(43)}`;
    for (const header of [undefined, 'Bearer', 'Bearer nonsense', `Bearer ${made}`, `Basic ${token}`]) {
      const req = request(app).get('/auth/me');
      if (header) req.set('Authorization', header);
      const res = await req;
      expect(res.status, String(header)).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    }

    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 second', created_at = now() - interval '2 days' WHERE user_id = $1", [id]);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('stay valid while in use, by pushing the expiry forward', async () => {
    const { token, id } = await appUser();
    await pool.query(
      "UPDATE sessions SET created_at = now() - interval '30 days', last_seen_at = now() - interval '2 hours', expires_at = now() + interval '5 days' WHERE user_id = $1",
      [id]
    );
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    const rows = await query<{ days: number }>('SELECT extract(epoch FROM expires_at - now()) / 86400 AS days FROM sessions WHERE user_id = $1', [id]);
    expect(Number(rows[0]!.days)).toBeGreaterThan(59);
  });

  it('end with logout, on this device only', async () => {
    const { email, token } = await appUser();
    const other = await login({ email, password: PASSWORD, client: 'app' });

    const out = await request(app).post('/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(204);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${other.body.token}`)).status).toBe(200);
  });

  it('can all be ended at once', async () => {
    const { email, token } = await appUser();
    const other = await login({ email, password: PASSWORD, client: 'app' });
    expect((await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${token}`)).status).toBe(204);
    for (const t of [token, other.body.token]) {
      expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${t}`)).status).toBe(401);
    }
  });

  it('clear the website cookie on logout', async () => {
    const res = await signup({ email: freshEmail(), password: PASSWORD });
    const cookie = cookieFrom(res)!.split(';')[0]!;
    const out = await request(app).post('/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN);
    expect(out.status).toBe(204);
    expect(cookieFrom(out)).toMatch(/^attracker_session=;.*Expires=Thu, 01 Jan 1970/i);
    expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe.skipIf(skipWithoutDatabase)('cross-site protection', () => {
  it('refuses cookie-authenticated changes from other sites or with no origin', async () => {
    const res = await signup({ email: freshEmail(), password: PASSWORD });
    const cookie = cookieFrom(res)!.split(';')[0]!;

    for (const origin of [undefined, 'https://evil.example', 'http://localhost:9999']) {
      const req = request(app).post('/auth/logout').set('Cookie', cookie);
      if (origin) req.set('Origin', origin);
      const blocked = await req;
      expect(blocked.status, String(origin)).toBe(403);
      expect(blocked.body.error).toBe('forbidden_origin');
    }
    expect((await request(app).get('/auth/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('does not apply to the app, whose token a website cannot send', async () => {
    const { token } = await appUser();
    const res = await request(app).post('/auth/logout').set('Authorization', `Bearer ${token}`).set('Origin', 'https://evil.example');
    expect(res.status).toBe(204);
  });
});

describe.skipIf(skipWithoutDatabase)('rate limits', () => {
  it('stop password guessing on one account, from any number of addresses', async () => {
    const email = freshEmail();
    await signup({ email, password: PASSWORD });
    const statuses: number[] = [];
    for (let i = 0; i < LIMITS.loginPerEmail.limit + 2; i += 1) {
      statuses.push((await login({ email, password: `guess ${i}` }, freshIp())).status);
    }
    expect(statuses.slice(0, LIMITS.loginPerEmail.limit).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(LIMITS.loginPerEmail.limit)).toEqual([429, 429]);

    const blocked = await login({ email, password: PASSWORD }, freshIp());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(LIMITS.loginPerEmail.windowSeconds);
  });

  it('limit sign-ups from one address', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < LIMITS.signupPerIp.limit + 1; i += 1) {
      statuses.push((await signup({ email: freshEmail(), password: PASSWORD }, ip)).status);
    }
    expect(statuses).toEqual([...Array(LIMITS.signupPerIp.limit).fill(201), 429]);
  });

  it('count each address separately', async () => {
    const busy = freshIp();
    for (let i = 0; i < LIMITS.signupPerIp.limit; i += 1) await signup({ email: freshEmail(), password: PASSWORD }, busy);
    expect((await signup({ email: freshEmail(), password: PASSWORD }, freshIp())).status).toBe(201);
  });
});
