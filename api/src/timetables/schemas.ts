import { z } from 'zod';

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const dateSchema = (label: string) =>
  z
    .string({ error: `${label} must be a date like 2026-07-20` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date like 2026-07-20`)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    }, `${label} is not a real date`)
    .refine((value) => value >= '2000-01-01' && value <= '2100-12-31', `${label} must be between 2000 and 2100`);

const percentSchema = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .gt(0, `${label} must be more than 0`)
    .max(100, `${label} must be at most 100`)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, `${label} can have at most 2 decimal places`);

const nameSchema = z
  .string({ error: 'Name is required' })
  .trim()
  .min(1, 'Name is required')
  .max(60, 'Name must be at most 60 characters');

const timeZoneSchema = z.string().trim().min(1).max(64).refine(isTimeZone, 'Time zone is not recognised');

const fields = {
  name: nameSchema,
  startsOn: dateSchema('Start date'),
  endsOn: dateSchema('End date').nullable(),
  timeZone: timeZoneSchema,
  requiredPercent: percentSchema('Required percentage').nullable(),
  condonationPercent: percentSchema('Condonation percentage').nullable(),
};

export type TimetableSettings = {
  name: string;
  startsOn: string;
  endsOn: string | null;
  timeZone: string;
  requiredPercent: number | null;
  condonationPercent: number | null;
};

export const settingsProblem = (settings: TimetableSettings) => {
  if (settings.endsOn !== null && settings.endsOn < settings.startsOn) return { field: 'endsOn', message: 'End date must be on or after the start date' };
  if (settings.condonationPercent !== null && settings.requiredPercent === null) {
    return { field: 'condonationPercent', message: 'Set a required percentage before a condonation percentage' };
  }
  if (settings.condonationPercent !== null && settings.requiredPercent !== null && settings.condonationPercent >= settings.requiredPercent) {
    return { field: 'condonationPercent', message: 'Condonation percentage must be below the required percentage' };
  }
  return null;
};

export const createTimetableSchema = z
  .strictObject({
    name: fields.name,
    startsOn: fields.startsOn,
    endsOn: fields.endsOn.default(null),
    timeZone: fields.timeZone.default('Asia/Kolkata'),
    requiredPercent: fields.requiredPercent.default(null),
    condonationPercent: fields.condonationPercent.default(null),
  })
  .superRefine((value, ctx) => {
    const problem = settingsProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
  });

export const updateTimetableSchema = z
  .strictObject({
    name: fields.name.optional(),
    startsOn: fields.startsOn.optional(),
    endsOn: fields.endsOn.optional(),
    timeZone: fields.timeZone.optional(),
    requiredPercent: fields.requiredPercent.optional(),
    condonationPercent: fields.condonationPercent.optional(),
    archived: z.boolean({ error: 'archived must be true or false' }).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Send at least one setting to change');

export type UpdateTimetable = z.infer<typeof updateTimetableSchema>;
