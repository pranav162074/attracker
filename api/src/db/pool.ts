import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { env } from '../config/env.ts';
import { logger } from '../config/logger.ts';
import { createWatch } from './watch.ts';

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RangeError(`bigint ${value} is too large for a JavaScript number`);
  return parsed;
});
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 10_000,
  query_timeout: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  maxLifetimeSeconds: 300,
  application_name: 'attracker-api',
});

export const poolStats = () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });

pool.on('error', (error) => {
  logger.error({ err: error }, 'Idle Postgres connection failed');
});

export const STUCK_AFTER = 5;

const watch = createWatch(STUCK_AFTER, (failures) => {
  logger.fatal({ failures, pool: poolStats() }, 'The database has stopped answering; restarting so Render starts a fresh server');
  setTimeout(() => process.exit(1), 200).unref();
});

const watched = async <T>(work: () => Promise<T>) => {
  try {
    const result = await work();
    watch.ok();
    return result;
  } catch (error) {
    watch.failed(error);
    throw error;
  }
};

export const query = async <Row extends QueryResultRow>(text: string, params: unknown[] = []) => {
  const result = await watched(() => pool.query<Row>(text, params));
  return result.rows;
};

export const withTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await watched(() => pool.connect());
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      broken = rollbackError instanceof Error ? rollbackError : new Error('Rollback failed');
    });
    throw error;
  } finally {
    client.release(broken);
  }
};

export const pingDatabase = async (timeoutMs = 3000) => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Database did not answer within ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const closePool = () => pool.end();
