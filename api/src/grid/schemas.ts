import { z } from 'zod';
import { dateSchema } from '../timetables/schemas.ts';
import { toClock, toMinutes, WEEKDAYS } from './time.ts';

export const MAX_SLOTS = 200;

const clock = (label: string) =>
  z
    .string({ error: `${label} must be a time like 08:40` })
    .refine((value) => toMinutes(value) !== null, `${label} must be a time like 08:40`)
    .transform((value) => toMinutes(value)!);

const slotSchema = z
  .strictObject({
    weekday: z.number({ error: 'weekday must be 1 (Monday) to 7 (Sunday)' }).int('weekday must be 1 (Monday) to 7 (Sunday)').min(1, 'weekday must be 1 (Monday) to 7 (Sunday)').max(7, 'weekday must be 1 (Monday) to 7 (Sunday)'),
    start: clock('start'),
    end: clock('end'),
    periods: z.number({ error: 'periods must be a whole number from 1 to 12' }).int('periods must be a whole number from 1 to 12').min(1, 'periods must be a whole number from 1 to 12').max(12, 'periods must be a whole number from 1 to 12').default(1),
    subjectId: z.number({ error: 'subjectId is required' }).int().positive(),
  })
  .refine((slot) => slot.end > slot.start, { error: 'end must be after start', path: ['end'] });

export type SlotInput = z.infer<typeof slotSchema>;

export const putGridSchema = z
  .strictObject({
    effectiveFrom: dateSchema('effectiveFrom'),
    slots: z.array(slotSchema, { error: 'slots must be a list' }).max(MAX_SLOTS, `A grid can have at most ${MAX_SLOTS} classes`),
    discardMarks: z.boolean({ error: 'discardMarks must be true or false' }).default(false),
  })
  .superRefine((value, ctx) => {
    const sorted = value.slots.map((slot, index) => ({ ...slot, index })).sort((a, b) => a.weekday - b.weekday || a.start - b.start);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (current.weekday === previous.weekday && current.start < previous.end) {
        ctx.addIssue({
          code: 'custom',
          path: ['slots', current.index],
          message: `Two classes overlap on ${WEEKDAYS[current.weekday - 1]}: ${toClock(previous.start)}–${toClock(previous.end)} and ${toClock(current.start)}–${toClock(current.end)}`,
        });
        return;
      }
    }
  });

export type PutGrid = z.infer<typeof putGridSchema>;
