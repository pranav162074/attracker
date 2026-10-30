import { env } from '../config/env.ts';
import { query } from '../db/pool.ts';
import { hashToken, looksLikeToken, newSessionToken } from './tokens.ts';

const RENEW_AFTER_MS = 60 * 60 * 1000;

export type SessionUser = { sessionId: number; userId: number; email: string; createdAt: Date };

export const createSession = async (userId: number, userAgent: string | undefined) => {
  const { token, hash } = newSessionToken();
  const rows = await query<{ expires_at: Date }>(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4)
     RETURNING expires_at`,
    [userId, hash, env.sessionDays, userAgent ? userAgent.slice(0, 300) : null]
  );
  return { token, expiresAt: rows[0]!.expires_at };
};

export const findSession = async (token: unknown): Promise<SessionUser | null> => {
  if (!looksLikeToken(token)) return null;
  const rows = await query<{ session_id: number; user_id: number; email: string; created_at: Date; last_seen_at: Date }>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.created_at, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.last_seen_at.getTime() > RENEW_AFTER_MS) {
    await query(
      `UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1`,
      [row.session_id, env.sessionDays]
    );
  }
  return { sessionId: row.session_id, userId: row.user_id, email: row.email, createdAt: row.created_at };
};

export const deleteSession = async (sessionId: number) => {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
};

export const deleteUserSessions = async (userId: number) => {
  const rows = await query<{ count: number }>(
    'WITH gone AS (DELETE FROM sessions WHERE user_id = $1 RETURNING 1) SELECT count(*)::int AS count FROM gone',
    [userId]
  );
  return rows[0]?.count ?? 0;
};

export const deleteExpiredSessions = async () => {
  const rows = await query<{ count: number }>(
    'WITH gone AS (DELETE FROM sessions WHERE expires_at <= now() RETURNING 1) SELECT count(*)::int AS count FROM gone'
  );
  return rows[0]?.count ?? 0;
};
