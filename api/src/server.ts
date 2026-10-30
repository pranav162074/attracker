import http from 'node:http';
import { env } from './config/env.ts';
import { logger } from './config/logger.ts';
import { app } from './app.ts';
import { closePool } from './db/pool.ts';
import { deleteExpiredSessions } from './auth/sessions.ts';
import { deleteOldWindows } from './middleware/rateLimit.ts';

const server = http.createServer(app);

server.listen(env.port, () => {
  logger.info({ port: env.port, env: env.nodeEnv }, 'attracker API is listening');
});

const HOUSEKEEPING_MS = 60 * 60 * 1000;

const housekeeping = async () => {
  try {
    const sessions = await deleteExpiredSessions();
    const windows = await deleteOldWindows();
    if (sessions + windows > 0) logger.info({ sessions, windows }, 'Removed expired sessions and rate limit windows');
  } catch (error) {
    logger.warn({ err: error }, 'Housekeeping failed');
  }
};

const housekeepingTimer = setInterval(housekeeping, HOUSEKEEPING_MS);
housekeepingTimer.unref();

let shuttingDown = false;

const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  clearInterval(housekeepingTimer);
  const force = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(async () => {
    try {
      await closePool();
    } catch (error) {
      logger.error({ err: error }, 'Error while closing the database pool');
    }
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
