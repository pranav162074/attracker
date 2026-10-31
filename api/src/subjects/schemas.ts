import { z } from 'zod';

export const KINDS = ['theory', 'lab', 'other'] as const;

const name = z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(80, 'Name must be at most 80 characters');
const shortName = z.string().trim().min(1, 'Short name cannot be empty').max(12, 'Short name must be at most 12 characters').nullable();
const kind = z.enum(KINDS, { error: 'Kind must be theory, lab or other' });
const colour = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, 'Colour must look like #2563eb')
  .nullable();

export const createSubjectSchema = z.strictObject({
  name,
  shortName: shortName.default(null),
  kind: kind.default('theory'),
  countsAttendance: z.boolean({ error: 'countsAttendance must be true or false' }).optional(),
  countPerSession: z.boolean({ error: 'countPerSession must be true or false' }).default(false),
  colour: colour.default(null),
});

export const updateSubjectSchema = z
  .strictObject({
    name: name.optional(),
    shortName: shortName.optional(),
    kind: kind.optional(),
    countsAttendance: z.boolean({ error: 'countsAttendance must be true or false' }).optional(),
    countPerSession: z.boolean({ error: 'countPerSession must be true or false' }).optional(),
    colour: colour.optional(),
    archived: z.boolean({ error: 'archived must be true or false' }).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');

export type CreateSubject = z.infer<typeof createSubjectSchema>;
export type UpdateSubject = z.infer<typeof updateSubjectSchema>;
