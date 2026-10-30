import type { Request, RequestHandler } from 'express';
import { query } from '../db/pool.ts';

export type Limit = { bucket: string; limit: number; windowSeconds: number };

export const hit = async ({ bucket, limit, windowSeconds }: Limit, key: string) => {
  const rows = await query<{ hits: number; retry_after: number }>(
    `WITH w AS (SELECT to_timestamp(floor(extract(epoch FROM now()) / $3) * $3) AS start)
     INSERT INTO rate_limit_windows (bucket, key, window_start, hits)
     SELECT $1, $2, w.start, 1 FROM w
     ON CONFLICT (bucket, key, window_start) DO UPDATE SET hits = rate_limit_windows.hits + 1
     RETURNING hits, ceil(extract(epoch FROM (window_start + make_interval(secs => $3) - now())))::int AS retry_after`,
    [bucket, key.slice(0, 300), windowSeconds]
  );
  const row = rows[0]!;
  return { allowed: row.hits <= limit, retryAfter: Math.max(1, row.retry_after) };
};

export const rateLimit =
  (limit: Limit, keyOf: (req: Request) => string | null): RequestHandler =>
  async (req, res, next) => {
    const key = keyOf(req);
    if (!key) return next();
    const { allowed, retryAfter } = await hit(limit, key);
    if (allowed) return next();
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'rate_limited', message: 'Too many attempts. Try again later.', retryAfter });
  };

export const deleteOldWindows = async () => {
  const rows = await query<{ count: number }>(
    "WITH gone AS (DELETE FROM rate_limit_windows WHERE window_start < now() - interval '1 day' RETURNING 1) SELECT count(*)::int AS count FROM gone"
  );
  return rows[0]?.count ?? 0;
};
