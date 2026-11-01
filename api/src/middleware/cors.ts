import type { RequestHandler } from 'express';
import { env } from '../config/env.ts';

const ALLOWED_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE';
const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Request-Id';

export const cors: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  res.vary('Origin');
  if (!origin || !env.allowedOrigins.has(origin)) return next();
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
    return;
  }
  next();
};
