import type { CookieOptions, Request } from 'express';
import { env } from '../config/env.ts';

export const SESSION_COOKIE = 'attracker_session';

export const readCookie = (req: Request, name: string) => {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const sessionCookieOptions = (expiresAt?: Date): CookieOptions => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  path: '/',
  ...(expiresAt && { expires: expiresAt }),
});
