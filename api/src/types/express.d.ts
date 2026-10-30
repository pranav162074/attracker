import type { SessionUser } from '../auth/sessions.ts';

declare global {
  namespace Express {
    interface Request {
      auth?: SessionUser & { via: 'cookie' | 'bearer' };
    }
  }
}

export {};
