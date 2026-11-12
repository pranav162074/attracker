import express from 'express';
import type { Request } from 'express';
import { HttpError } from '../http/errors.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import { validateBody } from '../middleware/validate.ts';
import { normaliseShareCode } from '../sharing/codes.ts';
import { copySchema, copyShared, previewShared } from '../sharing/repo.ts';
import type { CopyInput } from '../sharing/repo.ts';

export const SHARE_LIMITS = {
  lookupPerUser: { bucket: 'shared:user', limit: 30, windowSeconds: 900 },
  lookupPerIp: { bucket: 'shared:ip', limit: 60, windowSeconds: 900 },
};

const userOf = (req: Request) => (req.auth ? String(req.auth.userId) : null);
const ipOf = (req: Request) => req.ip ?? null;

const codeFrom = (value: unknown) => {
  const code = typeof value === 'string' ? normaliseShareCode(value) : null;
  if (!code) throw new HttpError(400, 'validation_error', 'A code is 8 letters and numbers, like 7K3P-Q9M2');
  return code;
};

export const sharedRoutes = express.Router();

sharedRoutes.use(requireAuth);
sharedRoutes.use(rateLimit(SHARE_LIMITS.lookupPerIp, ipOf));
sharedRoutes.use(rateLimit(SHARE_LIMITS.lookupPerUser, userOf));
sharedRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

sharedRoutes.get('/:code', async (req, res) => {
  res.json({ shared: await previewShared(codeFrom(req.params.code)) });
});

sharedRoutes.post('/:code/copy', validateBody(copySchema), async (req, res) => {
  res.status(201).json({ timetable: await copyShared(req.auth!.userId, codeFrom(req.params.code), req.body as CopyInput) });
});
