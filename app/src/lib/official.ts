import type { Checkpoint, CheckpointInput, FieldErrors, SheetPreview, Subject, Timetable } from './api.ts';
import { formatDate } from './dates.ts';

export type CountPair = { held: string; attended: string };

export type OfficialForm = {
  asOf: string | null;
  rows: Record<number, CountPair>;
  freeHeld: string;
  freeAttended: string;
};

export const countedSubjects = (subjects: Subject[]) => subjects.filter((subject) => subject.countsAttendance && !subject.archived);

export const newOfficialForm = (subjects: Subject[]): OfficialForm => ({
  asOf: null,
  rows: Object.fromEntries(countedSubjects(subjects).map((subject) => [subject.id, { held: '', attended: '' }])),
  freeHeld: '',
  freeAttended: '',
});

export const formFromPreview = (preview: SheetPreview, subjects: Subject[]): OfficialForm => {
  const form = newOfficialForm(subjects);
  for (const entry of preview.subjects) {
    if (entry.subjectId !== null && form.rows[entry.subjectId]) form.rows[entry.subjectId] = { held: String(entry.held), attended: String(entry.attended) };
  }
  form.freeHeld = preview.freeHeld > 0 ? String(preview.freeHeld) : '';
  form.freeAttended = preview.freeAttended > 0 ? String(preview.freeAttended) : '';
  return form;
};

export const parseCount = (text: string): number | 'bad' | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d{1,5}$/.test(trimmed)) return 'bad';
  return Number(trimmed);
};

export const checkOfficial = (
  form: OfficialForm,
  subjects: Subject[],
  timetable: Pick<Timetable, 'startsOn' | 'endsOn'>,
  today: string,
  source: CheckpointInput['source']
): { input: CheckpointInput | null; errors: FieldErrors } => {
  const errors: FieldErrors = {};
  if (!form.asOf) errors.asOf = 'Choose the date these numbers are up to';
  else if (form.asOf < timetable.startsOn || (timetable.endsOn && form.asOf > timetable.endsOn)) errors.asOf = 'Must be within the timetable’s dates';
  else if (form.asOf > today) errors.asOf = 'Cannot be later than today';

  const rows: CheckpointInput['subjects'] = [];
  for (const subject of countedSubjects(subjects)) {
    const pair = form.rows[subject.id] ?? { held: '', attended: '' };
    const held = parseCount(pair.held);
    const attended = parseCount(pair.attended);
    if (held === null || attended === null) {
      errors[`subject-${subject.id}`] = 'Enter both numbers';
      continue;
    }
    if (held === 'bad' || attended === 'bad') {
      errors[`subject-${subject.id}`] = 'Whole numbers only';
      continue;
    }
    if (attended > held) {
      errors[`subject-${subject.id}`] = 'Attended cannot be more than held';
      continue;
    }
    rows.push({ subjectId: subject.id, held, attended });
  }

  const freeHeld = parseCount(form.freeHeld) ?? 0;
  const freeAttended = parseCount(form.freeAttended) ?? 0;
  if (freeHeld === 'bad' || freeAttended === 'bad') errors.free = 'Whole numbers only';
  else if (freeAttended > freeHeld) errors.free = 'Attended cannot be more than held';

  if (rows.length === 0 && !errors.asOf && Object.keys(errors).every((key) => !key.startsWith('subject-'))) errors.asOf = 'There are no subjects that count for attendance';
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return { input: { asOf: form.asOf!, source, freeHeld: freeHeld as number, freeAttended: freeAttended as number, subjects: rows }, errors };
};

export const formTotals = (form: OfficialForm) => {
  let held = 0;
  let attended = 0;
  for (const pair of [...Object.values(form.rows), { held: form.freeHeld, attended: form.freeAttended }]) {
    const h = parseCount(pair.held);
    const a = parseCount(pair.attended);
    if (typeof h === 'number') held += h;
    if (typeof a === 'number') attended += a;
  }
  return { held, attended };
};

export const checkpointTotals = (checkpoint: Pick<Checkpoint, 'subjects' | 'freeHeld' | 'freeAttended'>) => ({
  held: checkpoint.subjects.reduce((sum, row) => sum + row.held, checkpoint.freeHeld),
  attended: checkpoint.subjects.reduce((sum, row) => sum + row.attended, checkpoint.freeAttended),
});

export const truncatedPercent = (attended: number, held: number) => {
  if (held === 0) return null;
  const hundredths = Math.floor((attended * 10_000) / held);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}%`;
};

export const checkpointTitle = (checkpoint: Pick<Checkpoint, 'asOf' | 'source'>) =>
  `Up to ${formatDate(checkpoint.asOf)}${checkpoint.source === 'sheet' ? ', from the class sheet' : ', typed in'}`;

export const unusedSheetSubjects = (preview: SheetPreview) => preview.subjects.filter((entry) => entry.subjectId === null);
