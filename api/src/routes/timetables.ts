import express from 'express';
import { idParam } from '../http/params.ts';
import { requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import { createTimetableSchema, updateTimetableSchema } from '../timetables/schemas.ts';
import type { TimetableSettings, UpdateTimetable } from '../timetables/schemas.ts';
import { createTimetable, deleteTimetable, getTimetable, listTimetables, updateTimetable } from '../timetables/repo.ts';
import { subjectRoutes } from './subjects.ts';
import { gridRoutes } from './grid.ts';
import { calendarRoutes } from './calendar.ts';

export const timetableRoutes = express.Router();

timetableRoutes.use(requireAuth);
timetableRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

timetableRoutes.get('/', async (req, res) => {
  const timetables = await listTimetables(req.auth!.userId, req.query.archived === 'true');
  res.json({ timetables });
});

timetableRoutes.post('/', validateBody(createTimetableSchema), async (req, res) => {
  const timetable = await createTimetable(req.auth!.userId, req.body as TimetableSettings);
  res.status(201).json({ timetable });
});

timetableRoutes.get('/:id', async (req, res) => {
  res.json({ timetable: await getTimetable(req.auth!.userId, idParam(req.params.id, 'Timetable')) });
});

timetableRoutes.patch('/:id', validateBody(updateTimetableSchema), async (req, res) => {
  const timetable = await updateTimetable(req.auth!.userId, idParam(req.params.id, 'Timetable'), req.body as UpdateTimetable);
  res.json({ timetable });
});

timetableRoutes.delete('/:id', async (req, res) => {
  await deleteTimetable(req.auth!.userId, idParam(req.params.id, 'Timetable'));
  res.status(204).end();
});

timetableRoutes.use('/:timetableId/subjects', subjectRoutes);
timetableRoutes.use('/:timetableId/grid', gridRoutes);
timetableRoutes.use('/:timetableId/calendar', calendarRoutes);
