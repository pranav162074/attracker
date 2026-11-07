import type { FieldErrors, Subject, SubjectInput, SubjectKind, Timetable, TimetableInput } from './api.ts';

export type TimetableForm = {
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  requiredPercent: string;
  condonationPercent: string;
};

export const newTimetableForm = (): TimetableForm => ({
  name: '',
  startsOn: null,
  endsOn: null,
  requiredPercent: '75',
  condonationPercent: '65',
});

const percentText = (value: number | null) => (value === null ? '' : String(value));

export const timetableFormFrom = (timetable: Timetable): TimetableForm => ({
  name: timetable.name,
  startsOn: timetable.startsOn,
  endsOn: timetable.endsOn,
  requiredPercent: percentText(timetable.requiredPercent),
  condonationPercent: percentText(timetable.condonationPercent),
});

export const parsePercent = (text: string): { value: number | null; error: string | null } => {
  const trimmed = text.trim().replace(/%$/, '').trim();
  if (!trimmed) return { value: null, error: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return { value: null, error: 'Enter a number like 75 or 72.5, with at most 2 decimals' };
  const value = Number(trimmed);
  if (value <= 0 || value > 100) return { value: null, error: 'Enter a percentage above 0 and up to 100' };
  return { value, error: null };
};

export const checkTimetableForm = (form: TimetableForm): { input: TimetableInput | null; errors: FieldErrors } => {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Give the semester a name';
  else if (name.length > 60) errors.name = 'Name must be at most 60 characters';
  if (!form.startsOn) errors.startsOn = 'Choose the first day of classes';
  if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) errors.endsOn = 'The last day must be on or after the first day';

  const required = parsePercent(form.requiredPercent);
  const condonation = parsePercent(form.condonationPercent);
  if (required.error) errors.requiredPercent = required.error;
  if (condonation.error) errors.condonationPercent = condonation.error;
  if (!condonation.error && condonation.value !== null) {
    if (!required.error && required.value === null) errors.condonationPercent = 'Set the required percentage first, or leave this empty';
    else if (required.value !== null && condonation.value >= required.value) {
      errors.condonationPercent = 'Must be below the required percentage';
    }
  }

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      name,
      startsOn: form.startsOn!,
      endsOn: form.endsOn,
      requiredPercent: required.value,
      condonationPercent: condonation.value,
    },
    errors,
  };
};

export const PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea',
];

export type SubjectForm = {
  name: string;
  shortName: string;
  kind: SubjectKind;
  countsAttendance: boolean;
  countPerSession: boolean;
  colour: string | null;
};

export const newSubjectForm = (): SubjectForm => ({
  name: '',
  shortName: '',
  kind: 'theory',
  countsAttendance: true,
  countPerSession: false,
  colour: null,
});

export const subjectFormFrom = (subject: Subject): SubjectForm => ({
  name: subject.name,
  shortName: subject.shortName ?? '',
  kind: subject.kind,
  countsAttendance: subject.countsAttendance,
  countPerSession: subject.countPerSession,
  colour: subject.colour,
});

export const withKind = (form: SubjectForm, kind: SubjectKind): SubjectForm => ({
  ...form,
  kind,
  countsAttendance: kind === 'other' ? false : form.kind === 'other' ? true : form.countsAttendance,
});

export const checkSubjectForm = (form: SubjectForm): { input: SubjectInput | null; errors: FieldErrors } => {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  const shortName = form.shortName.trim();
  if (!name) errors.name = 'Enter the subject name';
  else if (name.length > 80) errors.name = 'Name must be at most 80 characters';
  if (shortName.length > 12) errors.shortName = 'Short name must be at most 12 characters';
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      name,
      shortName: shortName || null,
      kind: form.kind,
      countsAttendance: form.countsAttendance,
      countPerSession: form.countPerSession,
      colour: form.colour,
    },
    errors,
  };
};

export const KIND_LABELS: Record<SubjectKind, string> = { theory: 'Theory', lab: 'Lab', other: 'Other' };

export const subjectNote = (subject: Pick<Subject, 'kind' | 'countsAttendance' | 'countPerSession' | 'archived'>) => {
  const parts = [KIND_LABELS[subject.kind]];
  if (!subject.countsAttendance) parts.push('not counted');
  else if (subject.countPerSession) parts.push('each class counts as 1');
  if (subject.archived) parts.push('archived');
  return parts.join(' · ');
};

export const STEP_TITLES = { dates: 'Semester dates and rules', subjects: 'Subjects', grid: 'Weekly timetable', holidays: 'Holidays and special days', official: 'Attendance from college' } as const;
