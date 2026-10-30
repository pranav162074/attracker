import { query, withTransaction } from '../db/pool.ts';
import type { UserRow } from './users.ts';

export class GoogleAccountMismatchError extends Error {
  constructor() {
    super('This email is already linked to a different Google account');
  }
}

export const signInWithGoogle = (profile: { subject: string; email: string }) =>
  withTransaction(async (client) => {
    const linked = await client.query<UserRow>(
      `SELECT u.id, u.email, u.password_hash, u.created_at
         FROM user_identities i JOIN users u ON u.id = i.user_id
        WHERE i.provider = 'google' AND i.subject = $1`,
      [profile.subject]
    );
    if (linked.rows[0]) return { user: linked.rows[0], created: false };

    const inserted = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash) VALUES ($1, NULL)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, password_hash, created_at`,
      [profile.email]
    );
    const created = inserted.rows.length > 0;
    const user =
      inserted.rows[0] ??
      (await client.query<UserRow>('SELECT id, email, password_hash, created_at FROM users WHERE email = $1 FOR UPDATE', [profile.email])).rows[0]!;

    const identity = await client.query<{ user_id: number }>(
      `INSERT INTO user_identities (user_id, provider, subject, email) VALUES ($1, 'google', $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING user_id`,
      [user.id, profile.subject, profile.email]
    );
    if (identity.rows.length === 0) {
      const winner = await client.query<UserRow>(
        `SELECT u.id, u.email, u.password_hash, u.created_at
           FROM user_identities i JOIN users u ON u.id = i.user_id
          WHERE i.provider = 'google' AND i.subject = $1`,
        [profile.subject]
      );
      if (winner.rows[0]) return { user: winner.rows[0], created: false };
      throw new GoogleAccountMismatchError();
    }
    return { user, created };
  });

export const signInMethodsFor = async (userId: number) => {
  const rows = await query<{ methods: string[] }>(
    `SELECT array_remove(ARRAY[CASE WHEN u.password_hash IS NOT NULL THEN 'password' END], NULL)
            || coalesce(array_agg(i.provider ORDER BY i.provider) FILTER (WHERE i.provider IS NOT NULL), '{}') AS methods
       FROM users u LEFT JOIN user_identities i ON i.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
    [userId]
  );
  return rows[0]?.methods ?? [];
};
