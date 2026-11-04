import { pino } from 'pino';
import { env } from './env.ts';

export const REDACTED = ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-attracker-proxy"]', 'res.headers["set-cookie"]'];

export const logger = pino({
  level: env.isTest ? 'silent' : env.logLevel,
  redact: REDACTED,
  ...(env.nodeEnv === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  }),
});
