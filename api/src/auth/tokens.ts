import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'at_';
const FORMAT = /^at_[A-Za-z0-9_-]{43}$/;

export const hashToken = (token: string) => createHash('sha256').update(token).digest();

export const newSessionToken = () => {
  const token = `${PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashToken(token) };
};

export const looksLikeToken = (value: unknown): value is string => typeof value === 'string' && FORMAT.test(value);
