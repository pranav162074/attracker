import { z } from 'zod';
import { toMinutes } from '../grid/time.ts';
import { dateSchema } from '../timetables/schemas.ts';

export const KINDS = ['holiday', 'follows_weekday', 'no_classes_before', 'no_classes_after'] as const;
export type Kind = (typeof KINDS)[number];
export const MAX_DAYS = 400;

const label = z.string().trim().min(1, 'Label cannot be empty').max(80, 'Label must be at most 80 characters').nullable();

const fields = z.strictObject({
  kind: z.enum(KINDS, { error: 'kind must be holiday, follows_weekday, no_classes_before or no_classes_after' }),
  startsOn: dateSchema('startsOn'),
  endsOn: dateSchema('endsOn').optional(),
  followsWeekday: z
    .number({ error: 'followsWeekday must be 1 (Monday) to 7 (Sunday)' })
    .int('followsWeekday must be 1 (Monday) to 7 (Sunday)')
    .min(1, 'followsWeekday must be 1 (Monday) to 7 (Sunday)')
    .max(7, 'followsWeekday must be 1 (Monday) to 7 (Sunday)')
    .nullable()
    .optional(),
  cutoff: z
    .string({ error: 'cutoff must be a time like 12:00' })
    .refine((value) => toMinutes(value) !== null, 'cutoff must be a time like 12:00')
    .nullable()
    .optional(),
  label: label.optional(),
});

export type CalendarDayInput = {
  kind: Kind;
  startsOn: string;
  endsOn: string;
  followsWeekday: number | null;
  cutoff: string | null;
  label: string | null;
};

export const dayProblem = (day: CalendarDayInput): { field: string; message: string } | null => {
  if (day.endsOn < day.startsOn) return { field: 'endsOn', message: 'endsOn must be on or after startsOn' };
  if (day.kind !== 'holiday' && day.endsOn !== day.startsOn) return { field: 'endsOn', message: 'Only holidays can cover more than one day' };
  if (day.kind === 'follows_weekday' && day.followsWeekday === null) return { field: 'followsWeekday', message: 'Choose which weekday’s timetable this day follows' };
  if (day.kind !== 'follows_weekday' && day.followsWeekday !== null) return { field: 'followsWeekday', message: 'followsWeekday only applies to follows_weekday' };
  const needsCutoff = day.kind === 'no_classes_before' || day.kind === 'no_classes_after';
  if (needsCutoff && day.cutoff === null) return { field: 'cutoff', message: 'Give the time classes stop or start, like 12:00' };
  if (!needsCutoff && day.cutoff !== null) return { field: 'cutoff', message: 'cutoff only applies to half days' };
  return null;
};

const normalise = (value: z.infer<typeof fields>): CalendarDayInput => ({
  kind: value.kind,
  startsOn: value.startsOn,
  endsOn: value.endsOn ?? value.startsOn,
  followsWeekday: value.followsWeekday ?? null,
  cutoff: value.cutoff ?? null,
  label: value.label ?? null,
});

export const calendarDaySchema = fields.transform(normalise).superRefine((day, ctx) => {
  const problem = dayProblem(day);
  if (problem) ctx.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
});

export const bulkSchema = z.strictObject({
  days: z.array(calendarDaySchema, { error: 'days must be a list' }).min(1, 'Send at least one day').max(200, 'Send at most 200 days at a time'),
});

export const updateDaySchema = fields
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');

export const importSchema = z.strictObject({
  text: z.string({ error: 'Paste the holiday list as text' }).min(1, 'Paste the holiday list as text').max(20_000, 'That is too much text; paste only the holiday list'),
});
