import { describe, it, expect } from 'vitest';
import type { SheetPreview, Subject } from '../src/lib/api.ts';
import { checkOfficial, checkpointTitle, checkpointTotals, countedSubjects, formFromPreview, formTotals, newOfficialForm, parseCount, truncatedPercent, unusedSheetSubjects } from '../src/lib/official.ts';

const subject = (id: number, name: string, values: Partial<Subject> = {}): Subject => ({
  id,
  timetableId: 1,
  name,
  shortName: null,
  kind: 'theory',
  countsAttendance: true,
  countPerSession: false,
  colour: null,
  archived: false,
  ...values,
});

const subjects = [
  subject(1, 'Data Warehousing and Data Mining'),
  subject(2, 'Computer Networks'),
  subject(3, 'Computer Networks Lab', { kind: 'lab' }),
  subject(4, 'Library', { kind: 'other', countsAttendance: false }),
  subject(5, 'Old elective', { archived: true }),
];

const term = { startsOn: '2026-07-20', endsOn: '2026-11-14' };

const preview: SheetPreview = {
  registration: 'TEST0000015',
  subjects: [
    { code: 'DWDM', name: 'Data Warehousing and Data Mining', held: 32, attended: 15, subjectId: 1 },
    { code: 'CN', name: 'Computer Networks', held: 26, attended: 18, subjectId: 2 },
    { code: 'MP', name: 'Mini Project', held: 10, attended: 10, subjectId: null },
  ],
  totals: { held: 246, attended: 150 },
  freeHeld: 8,
  freeAttended: 8,
  unmatchedSubjects: [{ id: 3, name: 'Computer Networks Lab' }],
};

describe('the official numbers form', () => {
  it('asks only for subjects that count and are not archived', () => {
    expect(countedSubjects(subjects).map((item) => item.id)).toEqual([1, 2, 3]);
    expect(Object.keys(newOfficialForm(subjects).rows)).toEqual(['1', '2', '3']);
  });

  it('fills in what the sheet matched, and leaves the rest for the student', () => {
    const form = formFromPreview(preview, subjects);
    expect(form.rows).toEqual({ 1: { held: '32', attended: '15' }, 2: { held: '26', attended: '18' }, 3: { held: '', attended: '' } });
    expect(form).toMatchObject({ freeHeld: '8', freeAttended: '8', asOf: null });
    expect(unusedSheetSubjects(preview).map((entry) => entry.name)).toEqual(['Mini Project']);
  });

  it('turns a complete form into what the API expects', () => {
    const form = { ...formFromPreview(preview, subjects), asOf: '2026-09-30' };
    form.rows[3] = { held: '30', attended: '27' };
    expect(checkOfficial(form, subjects, term, '2026-11-03', 'sheet')).toEqual({
      input: {
        asOf: '2026-09-30',
        source: 'sheet',
        freeHeld: 8,
        freeAttended: 8,
        subjects: [
          { subjectId: 1, held: 32, attended: 15 },
          { subjectId: 2, held: 26, attended: 18 },
          { subjectId: 3, held: 30, attended: 27 },
        ],
      },
      errors: {},
    });
  });

  it('needs every subject, sensible numbers and a date inside the term and not in the future', () => {
    const form = formFromPreview(preview, subjects);
    form.rows[2] = { held: '10', attended: '12' };
    form.freeAttended = '9';
    expect(checkOfficial(form, subjects, term, '2026-11-03', 'sheet').errors).toEqual({
      asOf: 'Choose the date these numbers are up to',
      'subject-2': 'Attended cannot be more than held',
      'subject-3': 'Enter both numbers',
      free: 'Attended cannot be more than held',
    });
    const filled = { ...newOfficialForm([subjects[0]!]), rows: { 1: { held: '5', attended: '4' } } };
    expect(checkOfficial({ ...filled, asOf: '2026-11-04' }, subjects.slice(0, 1), term, '2026-11-03', 'manual').errors).toEqual({ asOf: 'Cannot be later than today' });
    expect(checkOfficial({ ...filled, asOf: '2026-07-19' }, subjects.slice(0, 1), term, '2026-11-03', 'manual').errors).toEqual({ asOf: 'Must be within the timetable’s dates' });
    expect(checkOfficial({ ...filled, asOf: '2026-09-30' }, subjects.slice(0, 1), term, '2026-11-03', 'manual').input?.freeHeld).toBe(0);
    expect(checkOfficial({ ...filled, asOf: '2026-09-30', rows: { 1: { held: '10', attended: '11' } } }, subjects.slice(0, 1), term, '2026-11-03', 'manual').errors).toEqual({
      'subject-1': 'Attended cannot be more than held',
    });
    expect(checkOfficial({ ...filled, asOf: '2026-09-30', rows: { 1: { held: '10', attended: '10' } } }, subjects.slice(0, 1), term, '2026-11-03', 'manual').errors).toEqual({});
  });

  it('reads whole numbers only', () => {
    expect(parseCount(' 32 ')).toBe(32);
    expect(parseCount('')).toBeNull();
    expect(parseCount('3.5')).toBe('bad');
    expect(parseCount('-1')).toBe('bad');
  });
});

describe('totals', () => {
  it('adds up the form and the saved entries, including other hours', () => {
    const form = formFromPreview(preview, subjects);
    expect(formTotals(form)).toEqual({ held: 66, attended: 41 });
    expect(checkpointTotals({ freeHeld: 8, freeAttended: 8, subjects: [{ subjectId: 1, held: 238, attended: 142 }] })).toEqual({ held: 246, attended: 150 });
  });

  it('truncates percentages the way the college does', () => {
    expect(truncatedPercent(150, 246)).toBe('60.97%');
    expect(truncatedPercent(2, 3)).toBe('66.66%');
    expect(truncatedPercent(5, 5)).toBe('100.00%');
    expect(truncatedPercent(0, 0)).toBeNull();
  });

  it('names a saved entry by its date and where it came from', () => {
    expect(checkpointTitle({ asOf: '2026-09-30', source: 'sheet' })).toBe('Up to 30 Sep 2026, from the class sheet');
    expect(checkpointTitle({ asOf: '2026-09-30', source: 'manual' })).toBe('Up to 30 Sep 2026, typed in');
  });
});
