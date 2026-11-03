import { randomInt, timingSafeEqual } from 'node:crypto';
import { logger } from '../config/logger.ts';
import { query, withTransaction } from '../db/pool.ts';
import { sendEmail } from '../email/send.ts';
import { hashToken } from './tokens.ts';
import { findUserByEmail } from './users.ts';
import type { UserRow } from './users.ts';

export const CODE_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

const codeHash = (userId: number, code: string) => hashToken(`${userId}:${code}`);

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const resetEmail = (to: string, code: string) => ({
  to,
  subject: `Your attracker code is ${code}`,
  text: [
    `Your code to reset your attracker password is ${code}`,
    '',
    `It works for ${CODE_MINUTES} minutes. Enter it in attracker along with your new password.`,
    '',
    'If you did not ask to reset your password, you can ignore this email. Your password has not changed.',
  ].join('\n'),
});

const sendCode = async (email: string) => {
  const user = await findUserByEmail(email);
  if (!user) return;
  const code = newCode();
  await query(
    `INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))
     ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = now()`,
    [user.id, codeHash(user.id, code), CODE_MINUTES]
  );
  await sendEmail(resetEmail(user.email, code));
};

const inFlight = new Set<Promise<void>>();

export const requestReset = (email: string) => {
  const job = sendCode(email)
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Could not send a password reset code');
    })
    .finally(() => {
      inFlight.delete(job);
    });
  inFlight.add(job);
};

export const resetsSettled = async () => {
  await Promise.all([...inFlight]);
};

export type ResetResult = { ok: true; user: UserRow } | { ok: false; attemptsLeft: number };

export const resetPassword = (email: string, code: string, passwordHash: string): Promise<ResetResult> =>
  withTransaction(async (client) => {
    const { rows } = await client.query<UserRow & { code_hash: Buffer; attempts: number }>(
      `SELECT u.id, u.email, u.password_hash, u.created_at, r.code_hash, r.attempts
         FROM users u JOIN password_resets r ON r.user_id = u.id
        WHERE u.email = $1 AND r.expires_at > now() AND r.attempts < $2
        FOR UPDATE OF r`,
      [email, MAX_ATTEMPTS]
    );
    const row = rows[0];
    if (!row) return { ok: false, attemptsLeft: 0 };
    if (!timingSafeEqual(row.code_hash, codeHash(row.id, code))) {
      await client.query('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = $1', [row.id]);
      return { ok: false, attemptsLeft: MAX_ATTEMPTS - row.attempts - 1 };
    }
    await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [row.id, passwordHash]);
    await client.query('DELETE FROM password_resets WHERE user_id = $1', [row.id]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [row.id]);
    return { ok: true, user: { id: row.id, email: row.email, password_hash: passwordHash, created_at: row.created_at } };
  });

export const deleteOldResets = async () => {
  const rows = await query<{ count: number }>(
    "WITH gone AS (DELETE FROM password_resets WHERE expires_at < now() - interval '1 day' RETURNING 1) SELECT count(*)::int AS count FROM gone"
  );
  return rows[0]?.count ?? 0;
};
