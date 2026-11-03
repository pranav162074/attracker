import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { RequestHandler } from 'express';
import { env } from '../config/env.ts';

export const PROXY_HEADER = 'x-attracker-proxy';
export const CLIENT_IP_HEADER = 'x-attracker-client-ip';

const OPEN_PATHS = new Set(['/health', '/ready']);

const digest = (value: string) => createHash('sha256').update(value).digest();

const sameSecret = (supplied: unknown, secret: string) => typeof supplied === 'string' && timingSafeEqual(digest(supplied), digest(secret));

export const fromProxy: RequestHandler = (req, res, next) => {
  const secret = env.proxySecret;
  if (!secret) return next();
  if (!sameSecret(req.headers[PROXY_HEADER], secret)) {
    if (OPEN_PATHS.has(req.path)) return next();
    res.status(403).json({ error: 'forbidden', message: 'Use attracker through its website or app' });
    return;
  }
  const clientIp = req.headers[CLIENT_IP_HEADER];
  if (typeof clientIp === 'string' && isIP(clientIp)) Object.defineProperty(req, 'ip', { value: clientIp, configurable: true });
  next();
};
