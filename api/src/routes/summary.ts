import express from 'express';
import { HttpError } from '../http/errors.ts';
import { idParam } from '../http/params.ts';
import { requireAuth } from '../middleware/auth.ts';
import { dateSchema } from '../timetables/schemas.ts';
import { overview, timetableSummary, today } from '../attendance/summary.ts';

export const summaryRoutes = express.Router({ mergeParams: true });
export const homeRoutes = express.Router();

summaryRoutes.get('/', async (req, res) => {
  let asOf: string | undefined;
  if (req.query.asOf !== undefined) {
    const parsed = dateSchema('asOf').safeParse(req.query.asOf);
    if (!parsed.success) throw new HttpError(400, 'validation_error', parsed.error.issues[0]!.message);
    asOf = parsed.data;
  }
  res.json({ summary: await timetableSummary(req.auth!.userId, idParam((req.params as Record<string, unknown>).timetableId, 'Timetable'), asOf) });
});

homeRoutes.get('/overview', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ timetables: await overview(req.auth!.userId) });
});

homeRoutes.get('/today', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ classes: await today(req.auth!.userId) });
});
