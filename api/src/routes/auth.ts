import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { createSession, deleteSession, deleteUserSessions } from '../auth/sessions.ts';
import { googleSignInEnabled, GoogleTokenError, verifyGoogleIdToken } from '../auth/google.ts';
import { GoogleAccountMismatchError, signInMethodsFor, signInWithGoogle } from '../auth/identities.ts';
import { createUser, EmailTakenError, findUserByEmail, publicUser } from '../auth/users.ts';
import type { UserRow } from '../auth/users.ts';
import { SESSION_COOKIE, sessionCookieOptions } from '../http/cookies.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { Limit } from '../middleware/rateLimit.ts';
import { validateBody } from '../middleware/validate.ts';

export const LIMITS = {
  signupPerIp: { bucket: 'signup:ip', limit: 5, windowSeconds: 3600 },
  loginPerIp: { bucket: 'login:ip', limit: 30, windowSeconds: 900 },
  loginPerEmail: { bucket: 'login:email', limit: 10, windowSeconds: 900 },
  googlePerIp: { bucket: 'google:ip', limit: 30, windowSeconds: 900 },
} satisfies Record<string, Limit>;

const email = z
  .string({ error: 'Enter your email' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email({ error: 'Enter a valid email address' }));

const client = z.enum(['web', 'app']).default('web');

const signupSchema = z.strictObject({
  email,
  password: z
    .string({ error: 'Enter a password' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .refine((value) => value.trim().length > 0, 'Password cannot be only spaces'),
  client,
});

const loginSchema = z.strictObject({
  email,
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password').max(128, 'Password must be at most 128 characters'),
  client,
});

const googleSchema = z.strictObject({
  idToken: z.string({ error: 'idToken is required' }).min(20, 'idToken is not valid').max(4096, 'idToken is not valid'),
  client,
});

type Credentials = z.infer<typeof signupSchema>;

const ipOf = (req: Request) => req.ip ?? null;
const emailOf = (req: Request) => {
  const value = (req.body as { email?: unknown })?.email;
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
};

const startSession = async (req: Request, res: Response, row: UserRow, mode: 'web' | 'app', status: number) => {
  const user = { id: row.id, email: row.email, createdAt: row.created_at };
  const { token, expiresAt } = await createSession(user.id, req.get('user-agent'));
  res.set('Cache-Control', 'no-store');
  if (mode === 'app') {
    res.status(status).json({ user: publicUser(user), token, expiresAt: expiresAt.toISOString() });
    return;
  }
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  res.status(status).json({ user: publicUser(user), expiresAt: expiresAt.toISOString() });
};

export const authRoutes = express.Router();

authRoutes.post('/signup', rateLimit(LIMITS.signupPerIp, ipOf), validateBody(signupSchema), async (req, res) => {
  const body = req.body as Credentials;
  try {
    const user = await createUser(body.email, await hashPassword(body.password));
    await startSession(req, res, user, body.client, 201);
  } catch (error) {
    if (error instanceof EmailTakenError) {
      res.status(409).json({ error: 'email_taken', message: error.message });
      return;
    }
    throw error;
  }
});

authRoutes.post(
  '/login',
  rateLimit(LIMITS.loginPerIp, ipOf),
  rateLimit(LIMITS.loginPerEmail, emailOf),
  validateBody(loginSchema),
  async (req, res) => {
    const body = req.body as Credentials;
    const user = await findUserByEmail(body.email);
    const valid = await verifyPassword(body.password, user?.password_hash ?? null);
    if (!user || !valid) {
      res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect' });
      return;
    }
    await startSession(req, res, user, body.client, 200);
  }
);

authRoutes.post('/google', rateLimit(LIMITS.googlePerIp, ipOf), validateBody(googleSchema), async (req, res) => {
  if (!googleSignInEnabled()) {
    res.status(503).json({ error: 'google_disabled', message: 'Google sign-in is not set up on this server' });
    return;
  }
  const body = req.body as z.infer<typeof googleSchema>;
  try {
    const profile = await verifyGoogleIdToken(body.idToken);
    const { user, created } = await signInWithGoogle(profile);
    await startSession(req, res, user, body.client, created ? 201 : 200);
  } catch (error) {
    if (error instanceof GoogleTokenError) {
      res.status(401).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof GoogleAccountMismatchError) {
      res.status(409).json({ error: 'google_account_mismatch', message: error.message });
      return;
    }
    throw error;
  }
});

authRoutes.get('/me', requireAuth, async (req, res) => {
  const auth = req.auth!;
  const signInMethods = await signInMethodsFor(auth.userId);
  res.set('Cache-Control', 'no-store').json({
    user: { ...publicUser({ id: auth.userId, email: auth.email, createdAt: auth.createdAt }), signInMethods },
  });
});

authRoutes.post('/logout', requireAuth, async (req, res) => {
  await deleteSession(req.auth!.sessionId);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
});

authRoutes.post('/logout-all', requireAuth, async (req, res) => {
  await deleteUserSessions(req.auth!.userId);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
});
