import { pino } from 'pino';
import { env } from './env.ts';

export const logger = pino({
  level: env.isTest ? 'silent' : env.logLevel,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  ...(env.nodeEnv === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  }),
});
