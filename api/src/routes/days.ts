import express from 'express';
import { z } from 'zod';
import { HttpError } from '../http/errors.ts';
import { idParam } from '../http/params.ts';
import { validateBody } from '../middleware/validate.ts';
import { toMinutes } from '../grid/time.ts';
import { dateSchema } from '../timetables/schemas.ts';
import { addExtra, clearMark, deleteExtra, getDay, setMark, updateExtra } from '../attendance/marks.ts';
import type { ExtraInput, MarkInput } from '../attendance/marks.ts';

export const dayRoutes = express.Router({ mergeParams: true });
export const extraRoutes = express.Router({ mergeParams: true });

const timetableId = (params: Record<string, unknown>) => idParam(params.timetableId, 'Timetable');

const dateParam = (value: unknown) => {
  const parsed = dateSchema('Date').safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'validation_error', parsed.error.issues[0]!.message);
  return parsed.data;
};

const clock = (label: string) =>
  z.string({ error: `${label} must be a time like 08:40` }).refine((value) => toMinutes(value) !== null, `${label} must be a time like 08:40`);

const markSchema = z.strictObject({
  attendance: z.enum(['present', 'absent', 'cancelled'], { error: 'attendance must be present, absent or cancelled' }),
  substituteSubjectId: z.number({ error: 'substituteSubjectId must be a subject id' }).int().positive().nullable().default(null),
});

const periods = z.number({ error: 'periods must be a whole number from 1 to 12' }).int('periods must be a whole number from 1 to 12').min(1, 'periods must be a whole number from 1 to 12').max(12, 'periods must be a whole number from 1 to 12');
const attendance = z.enum(['present', 'absent'], { error: 'attendance must be present or absent' });

const extraSchema = z
  .strictObject({
    subjectId: z.number({ error: 'subjectId is required' }).int().positive(),
    start: clock('start'),
    end: clock('end'),
    periods: periods.default(1),
    attendance: attendance.default('present'),
  })
  .refine((value) => toMinutes(value.end)! > toMinutes(value.start)!, { error: 'end must be after start', path: ['end'] });

const extraUpdateSchema = z
  .strictObject({
    subjectId: z.number().int().positive().optional(),
    start: clock('start').optional(),
    end: clock('end').optional(),
    periods: periods.optional(),
    attendance: attendance.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');

dayRoutes.get('/:date', async (req, res) => {
  res.json({ day: await getDay(req.auth!.userId, timetableId(req.params), dateParam(req.params.date)) });
});

dayRoutes.put('/:date/classes/:slotId', validateBody(markSchema), async (req, res) => {
  const day = await setMark(
    req.auth!.userId,
    timetableId(req.params),
    dateParam(req.params.date),
    idParam(req.params.slotId, 'Class'),
    req.body as MarkInput
  );
  res.json({ day });
});

dayRoutes.delete('/:date/classes/:slotId', async (req, res) => {
  const day = await clearMark(req.auth!.userId, timetableId(req.params), dateParam(req.params.date), idParam(req.params.slotId, 'Class'));
  res.json({ day });
});

dayRoutes.post('/:date/extra', validateBody(extraSchema), async (req, res) => {
  const day = await addExtra(req.auth!.userId, timetableId(req.params), dateParam(req.params.date), req.body as ExtraInput);
  res.status(201).json({ day });
});

extraRoutes.patch('/:extraId', validateBody(extraUpdateSchema), async (req, res) => {
  const day = await updateExtra(req.auth!.userId, timetableId(req.params), idParam(req.params.extraId, 'Extra class'), req.body as Partial<ExtraInput>);
  res.json({ day });
});

extraRoutes.delete('/:extraId', async (req, res) => {
  const day = await deleteExtra(req.auth!.userId, timetableId(req.params), idParam(req.params.extraId, 'Extra class'));
  res.json({ day });
});
