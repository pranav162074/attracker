import { query } from '../db/pool.ts';

export type UserRow = { id: number; email: string; password_hash: string; created_at: Date };

export class EmailTakenError extends Error {
  constructor() {
    super('An account with this email already exists');
  }
}

export const createUser = async (email: string, passwordHash: string) => {
  try {
    const rows = await query<UserRow>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash, created_at',
      [email, passwordHash]
    );
    return rows[0]!;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new EmailTakenError();
    throw error;
  }
};

export const findUserByEmail = async (email: string) => {
  const rows = await query<UserRow>('SELECT id, email, password_hash, created_at FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
};

export const publicUser = (user: { id: number; email: string; createdAt: Date }) => ({
  id: user.id,
  email: user.email,
  createdAt: user.createdAt.toISOString(),
});
