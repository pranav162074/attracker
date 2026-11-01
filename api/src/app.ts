import { randomUUID } from 'node:crypto';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './config/logger.ts';
import { env } from './config/env.ts';
import { pingDatabase } from './db/pool.ts';
import { HttpError } from './http/errors.ts';
import { authRoutes } from './routes/auth.ts';
import { timetableRoutes } from './routes/timetables.ts';
import { homeRoutes } from './routes/summary.ts';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const supplied = req.headers['x-request-id'];
      const id = typeof supplied === 'string' && /^[\w-]{1,64}$/.test(supplied) ? supplied : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
  })
);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ok' });
});

app.get('/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await pingDatabase();
    res.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    req.log.warn({ err: error }, 'Readiness check failed');
    res.status(503).json({ status: 'unavailable', database: 'unreachable' });
  }
});

app.use('/auth', authRoutes);
app.use('/timetables', timetableRoutes);
app.use(homeRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

const handleError: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) });
    return;
  }
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) req.log.error({ err }, 'Unhandled error');
  res.status(status).json({
    error: status === 500 ? 'internal_error' : 'bad_request',
    message: status === 500 ? 'Something went wrong' : err.message,
  });
};

app.use(handleError);
