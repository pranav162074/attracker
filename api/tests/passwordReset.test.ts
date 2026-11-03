import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.ts';
import { env } from '../src/config/env.ts';
import { pool, query, closePool } from '../src/db/pool.ts';
import { MAX_ATTEMPTS, newCode, resetsSettled } from '../src/auth/passwordResets.ts';
import { EmailFailedError, sendEmail, sentEmails } from '../src/email/send.ts';
import { LIMITS } from '../src/routes/auth.ts';
import { databaseReady, skipWithoutDatabase } from './db.ts';

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new password';
const run = randomUUID().slice(0, 8);
const emails: string[] = [];
let ipCounter = 0;

const ipBase = `10.${(parseInt(run.slice(2, 4), 16) % 250) + 1}`;

const freshIp = () => {
  ipCounter += 1;
  return `${ipBase}.${Math.floor(ipCounter / 250) + 100}.${(ipCounter % 250) + 1}`;
};

const freshEmail = () => {
  const email = `reset-${run}-${randomUUID().slice(0, 8)}@example.com`;
  emails.push(email);
  return email;
};

const post = (path: string, body: Record<string, unknown>, ip = freshIp()) => request(app).post(path).set('X-Forwarded-For', ip).send(body);

const signup = async (email: string, client: 'web' | 'app' = 'app') => {
  const res = await post('/auth/signup', { email, password: PASSWORD, client });
  expect(res.status).toBe(201);
  return res.body.token as string | undefined;
};

const forgot = (email: string, ip?: string) => post('/auth/password/forgot', { email }, ip);

const reset = (body: Record<string, unknown>, ip?: string) => post('/auth/password/reset', body, ip);

const login = (email: string, password: string) => post('/auth/login', { email, password, client: 'app' });

const codeFor = async (email: string) => {
  await resetsSettled();
  const found = sentEmails.filter((sent) => sent.to === email).at(-1);
  if (!found) throw new Error(`No email was sent to ${email}`);
  const code = /\b(\d{6})\b/.exec(found.text)?.[1];
  if (!code) throw new Error('The email has no code');
  return code;
};

const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

afterAll(async () => {
  if (databaseReady) {
    if (emails.length > 0) await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    await pool.query('DELETE FROM rate_limit_windows WHERE key LIKE $1 OR key = ANY($2::text[])', [`${ipBase}.%`, emails]);
  }
  await closePool();
});

describe('reset codes', () => {
  it('are always six digits', () => {
    const codes = Array.from({ length: 200 }, newCode);
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(190);
  });
});

describe('sending email', () => {
  const saved = { ...env.email };

  afterEach(() => {
    Object.assign(env.email, saved);
    vi.unstubAllGlobals();
  });

  it('goes through Brevo with the key in a header', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    Object.assign(env.email, { transport: 'brevo', apiKey: 'test-key', from: 'sender@example.com', fromName: 'attracker' });
    await sendEmail({ to: 'someone@example.com', subject: 'Hi', text: 'Hello' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'attracker', email: 'sender@example.com' },
      to: [{ email: 'someone@example.com' }],
      subject: 'Hi',
      textContent: 'Hello',
    });
  });

  it('goes through Resend with a bearer key', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    Object.assign(env.email, { transport: 'resend', apiKey: 'test-key', from: 'sender@example.com', fromName: 'attracker' });
    await sendEmail({ to: 'someone@example.com', subject: 'Hi', text: 'Hello' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'attracker <sender@example.com>', to: ['someone@example.com'] });
  });

  it('reports a refused email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    Object.assign(env.email, { transport: 'brevo', apiKey: 'bad-key', from: 'sender@example.com' });
    await expect(sendEmail({ to: 'someone@example.com', subject: 'Hi', text: 'Hello' })).rejects.toBeInstanceOf(EmailFailedError);
  });
});

describe.skipIf(skipWithoutDatabase)('forgetting a password', () => {
  it('is switched off on a live server that has no email service', async () => {
    const email = freshEmail();
    Object.assign(env, { isProduction: true });
    try {
      const res = await forgot(email);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('email_disabled');
      const done = await reset({ email, code: '123456', password: NEW_PASSWORD });
      expect(done.status).toBe(503);
    } finally {
      Object.assign(env, { isProduction: false });
    }
  });

  it('emails a code and lets the user choose a new password', async () => {
    const email = freshEmail();
    const oldToken = await signup(email);
    const res = await forgot(email.toUpperCase());
    expect(res.status).toBe(202);
    const code = await codeFor(email);
    const sent = sentEmails.filter((item) => item.to === email).at(-1)!;
    expect(sent.subject).toContain(code);

    const done = await reset({ email, code, password: NEW_PASSWORD, client: 'app' });
    expect(done.status).toBe(200);
    expect(done.body.user.email).toBe(email);
    expect(done.body.token).toMatch(/^at_[\w-]{43}$/);

    expect((await login(email, PASSWORD)).status).toBe(401);
    expect((await login(email, NEW_PASSWORD)).status).toBe(200);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${oldToken}`)).status).toBe(401);
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${done.body.token}`)).status).toBe(200);
  });

  it('signs the website in with a cookie', async () => {
    const email = freshEmail();
    await signup(email, 'web');
    await forgot(email);
    const done = await reset({ email, code: await codeFor(email), password: NEW_PASSWORD });
    expect(done.status).toBe(200);
    expect(done.body.token).toBeUndefined();
    expect(String(done.headers['set-cookie'])).toMatch(/attracker_session=at_/);
  });

  it('answers the same for an email with no account, and sends nothing', async () => {
    const email = freshEmail();
    const before = sentEmails.length;
    const res = await forgot(email);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ message: 'If an account uses this email, a code is on its way.' });
    await resetsSettled();
    expect(sentEmails.length).toBe(before);
  });

  it('works only once', async () => {
    const email = freshEmail();
    await signup(email);
    await forgot(email);
    const code = await codeFor(email);
    expect((await reset({ email, code, password: NEW_PASSWORD })).status).toBe(200);
    const again = await reset({ email, code, password: 'another password here' });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('invalid_code');
  });

  it('keeps only the newest code', async () => {
    const email = freshEmail();
    await signup(email);
    await forgot(email);
    const first = await codeFor(email);
    await forgot(email);
    const second = await codeFor(email);
    if (first !== second) expect((await reset({ email, code: first, password: NEW_PASSWORD })).status).toBe(400);
    expect((await reset({ email, code: second, password: NEW_PASSWORD })).status).toBe(200);
  });

  it(`gives up after ${MAX_ATTEMPTS} wrong codes, even if the right one comes next`, async () => {
    const email = freshEmail();
    await signup(email);
    await forgot(email);
    const code = await codeFor(email);
    const messages: string[] = [];
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const res = await reset({ email, code: wrongCode(code), password: NEW_PASSWORD });
      expect(res.status).toBe(400);
      messages.push(res.body.message);
    }
    expect(messages[0]).toBe(`That code is not right. ${MAX_ATTEMPTS - 1} tries left.`);
    expect(messages.at(-2)).toBe('That code is not right. 1 try left.');
    expect(messages.at(-1)).toBe('That code has expired or been used up. Ask for a new one.');
    expect((await reset({ email, code, password: NEW_PASSWORD })).status).toBe(400);
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it('refuses an expired code', async () => {
    const email = freshEmail();
    await signup(email);
    await forgot(email);
    const code = await codeFor(email);
    await query("UPDATE password_resets r SET expires_at = now() - interval '1 minute' FROM users u WHERE u.id = r.user_id AND u.email = $1", [email]);
    const res = await reset({ email, code, password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it('stores only a hash of the code', async () => {
    const email = freshEmail();
    await signup(email);
    await forgot(email);
    const code = await codeFor(email);
    const rows = await query<{ code_hash: Buffer }>('SELECT r.code_hash FROM password_resets r JOIN users u ON u.id = r.user_id WHERE u.email = $1', [email]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code_hash.toString('hex')).not.toContain(Buffer.from(code).toString('hex'));
  });

  it('lets someone who signed up with Google set a password', async () => {
    const email = freshEmail();
    const user = await query<{ id: number }>('INSERT INTO users (email, password_hash) VALUES ($1, NULL) RETURNING id', [email]);
    expect(user).toHaveLength(1);
    await forgot(email);
    expect((await reset({ email, code: await codeFor(email), password: NEW_PASSWORD })).status).toBe(200);
    expect((await login(email, NEW_PASSWORD)).status).toBe(200);
  });

  it('checks the new password and the code format', async () => {
    const email = freshEmail();
    const short = await reset({ email, code: '123456', password: 'short' });
    expect(short.status).toBe(400);
    const letters = await reset({ email, code: 'abcdef', password: NEW_PASSWORD });
    expect(letters.status).toBe(400);
  });

  it('limits how many codes one email can ask for', async () => {
    const email = freshEmail();
    await signup(email);
    const statuses: number[] = [];
    for (let i = 0; i < LIMITS.forgotPerEmail.limit + 1; i += 1) statuses.push((await forgot(email, freshIp())).status);
    expect(statuses).toEqual([...Array(LIMITS.forgotPerEmail.limit).fill(202), 429]);
    await resetsSettled();
  });
});
