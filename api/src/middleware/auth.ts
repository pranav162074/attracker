import type { RequestHandler } from 'express';
import { env } from '../config/env.ts';
import { findSession } from '../auth/sessions.ts';
import { readCookie, SESSION_COOKIE } from '../http/cookies.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const bearerToken = (header: string | undefined) => {
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1];
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  const bearer = bearerToken(req.headers.authorization);
  const via = bearer ? 'bearer' : 'cookie';
  const session = await findSession(bearer ?? readCookie(req, SESSION_COOKIE));
  if (!session) {
    res.status(401).json({ error: 'unauthorized', message: 'Log in to continue' });
    return;
  }
  if (via === 'cookie' && !SAFE_METHODS.has(req.method)) {
    const origin = req.headers.origin;
    if (!origin || !env.allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'forbidden_origin', message: 'This request must come from the attracker app' });
      return;
    }
  }
  req.auth = { ...session, via };
  next();
};
