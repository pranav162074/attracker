import type { RequestHandler } from 'express';
import type { z } from 'zod';

export const validateBody =
  <Schema extends z.ZodType>(schema: Schema): RequestHandler =>
  (req, res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || null,
        message: issue.message,
      }));
      res.status(400).json({ error: 'validation_error', message: details[0]?.message ?? 'Invalid request', details });
      return;
    }
    req.body = parsed.data;
    next();
  };
