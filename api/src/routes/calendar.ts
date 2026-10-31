import express from 'express';
import { HttpError } from '../http/errors.ts';
import { idParam } from '../http/params.ts';
import { validateBody } from '../middleware/validate.ts';
import { bulkSchema, calendarDaySchema, importSchema, updateDaySchema } from '../calendar/schemas.ts';
import type { CalendarDayInput } from '../calendar/schemas.ts';
import { addDays, deleteDay, listDays, previewImport, updateDay } from '../calendar/repo.ts';
import { dateSchema } from '../timetables/schemas.ts';

export const calendarRoutes = express.Router({ mergeParams: true });

const timetableId = (params: Record<string, unknown>) => idParam(params.timetableId, 'Timetable');

const optionalDate = (value: unknown, name: string) => {
  if (value === undefined) return undefined;
  const parsed = dateSchema(name).safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'validation_error', parsed.error.issues[0]!.message);
  return parsed.data;
};

calendarRoutes.get('/', async (req, res) => {
  const days = await listDays(req.auth!.userId, timetableId(req.params), optionalDate(req.query.from, 'from'), optionalDate(req.query.to, 'to'));
  res.json({ days });
});

calendarRoutes.post('/', validateBody(calendarDaySchema), async (req, res) => {
  const [day] = await addDays(req.auth!.userId, timetableId(req.params), [req.body as CalendarDayInput]);
  res.status(201).json({ day });
});

calendarRoutes.post('/bulk', validateBody(bulkSchema), async (req, res) => {
  const days = await addDays(req.auth!.userId, timetableId(req.params), (req.body as { days: CalendarDayInput[] }).days);
  res.status(201).json({ days });
});

calendarRoutes.post('/import', validateBody(importSchema), async (req, res) => {
  res.json(await previewImport(req.auth!.userId, timetableId(req.params), (req.body as { text: string }).text));
});

calendarRoutes.patch('/:dayId', validateBody(updateDaySchema), async (req, res) => {
  const day = await updateDay(req.auth!.userId, timetableId(req.params), idParam(req.params.dayId, 'Calendar entry'), req.body);
  res.json({ day });
});

calendarRoutes.delete('/:dayId', async (req, res) => {
  await deleteDay(req.auth!.userId, timetableId(req.params), idParam(req.params.dayId, 'Calendar entry'));
  res.status(204).end();
});
