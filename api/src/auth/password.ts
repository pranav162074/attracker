import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

export const PASSWORD_PARAMS = { N: 32768, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const MAX_N = 1 << 17;

const derive = (password: string, salt: Buffer, params: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) => {
    const options: ScryptOptions = { ...params, maxmem: 256 * params.N * params.r };
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });

export const hashPassword = async (password: string, params: { N: number; r: number; p: number } = PASSWORD_PARAMS) => {
  const salt = randomBytes(16);
  const key = await derive(password, salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
};

const parse = (stored: string) => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (!N || !r || !p || !Number.isInteger(N) || N > MAX_N || (N & (N - 1)) !== 0 || r > 16 || p > 4) return null;
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const key = Buffer.from(parts[5] ?? '', 'base64url');
  if (salt.length < 16 || key.length !== KEY_LENGTH) return null;
  return { params: { N, r, p }, salt, key };
};

const DUMMY = parse(await hashPassword(randomBytes(12).toString('base64url')))!;

export const verifyPassword = async (password: string, stored: string | null) => {
  const parsed = stored === null ? null : parse(stored);
  const target = parsed ?? DUMMY;
  const actual = await derive(password, target.salt, target.params);
  return parsed !== null && timingSafeEqual(actual, target.key);
};
