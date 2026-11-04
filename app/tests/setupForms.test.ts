import { describe, it, expect } from 'vitest';
import type { Subject, Timetable } from '../src/lib/api.ts';
import {
  checkSubjectForm,
  checkTimetableForm,
  newSubjectForm,
  newTimetableForm,
  parsePercent,
  subjectFormFrom,
  subjectNote,
  timetableFormFrom,
  withKind,
} from '../src/lib/setupForms.ts';

const filled = { ...newTimetableForm(), name: '  College, Sem V ', startsOn: '2026-07-20', endsOn: '2026-11-14' };

describe('the timetable form', () => {
  it('starts with the usual college rules filled in', () => {
    expect(newTimetableForm()).toMatchObject({ requiredPercent: '75', condonationPercent: '65', startsOn: null, endsOn: null });
  });

  it('turns a filled form into what the API expects', () => {
    expect(checkTimetableForm(filled)).toEqual({
      input: { name: 'College, Sem V', startsOn: '2026-07-20', endsOn: '2026-11-14', requiredPercent: 75, condonationPercent: 65 },
      errors: {},
    });
  });

  it('allows no end date and no attendance rules, as for a dance class', () => {
    const { input } = checkTimetableForm({ ...filled, name: 'Dance', endsOn: null, requiredPercent: '', condonationPercent: ' ' });
    expect(input).toMatchObject({ endsOn: null, requiredPercent: null, condonationPercent: null });
  });

  it('asks for a name and a first day', () => {
    expect(checkTimetableForm(newTimetableForm()).errors).toEqual({ name: 'Give the timetable a name', startsOn: 'Choose the first day of classes' });
    expect(checkTimetableForm({ ...filled, name: 'x'.repeat(61) }).errors.name).toBe('Name must be at most 60 characters');
  });

  it('refuses a last day before the first', () => {
    expect(checkTimetableForm({ ...filled, endsOn: '2026-07-19' }).errors).toEqual({ endsOn: 'The last day must be on or after the first day' });
    expect(checkTimetableForm({ ...filled, endsOn: '2026-07-20' }).errors).toEqual({});
  });

  it('keeps condonation below the required percentage, and only with one', () => {
    expect(checkTimetableForm({ ...filled, condonationPercent: '75' }).errors).toEqual({ condonationPercent: 'Must be below the required percentage' });
    expect(checkTimetableForm({ ...filled, requiredPercent: '', condonationPercent: '65' }).errors).toEqual({
      condonationPercent: 'Set the required percentage first, or leave this empty',
    });
  });

  it('reads percentages the way people type them', () => {
    expect(parsePercent('75')).toEqual({ value: 75, error: null });
    expect(parsePercent(' 72.5% ')).toEqual({ value: 72.5, error: null });
    expect(parsePercent('100')).toEqual({ value: 100, error: null });
    expect(parsePercent('')).toEqual({ value: null, error: null });
    expect(parsePercent('0').error).toBe('Enter a percentage above 0 and up to 100');
    expect(parsePercent('101').error).toBe('Enter a percentage above 0 and up to 100');
    expect(parsePercent('72.555').error).toMatch(/at most 2 decimals/);
    expect(parsePercent('seventy').error).toMatch(/Enter a number/);
  });

  it('fills the form from a saved timetable', () => {
    const saved: Timetable = {
      id: 1,
      name: 'Dance',
      startsOn: '2026-09-01',
      endsOn: null,
      timeZone: 'Asia/Kolkata',
      requiredPercent: 80,
      condonationPercent: null,
      archived: false,
      status: 'setup',
      trackingStartedAt: null,
      trackingStartedOn: null,
    };
    expect(timetableFormFrom(saved)).toEqual({ name: 'Dance', startsOn: '2026-09-01', endsOn: null, requiredPercent: '80', condonationPercent: '' });
  });
});

describe('the subject form', () => {
  it('turns a filled form into what the API expects', () => {
    const { input } = checkSubjectForm({ ...newSubjectForm(), name: ' Computer Networks ', shortName: ' CN ' });
    expect(input).toEqual({ name: 'Computer Networks', shortName: 'CN', kind: 'theory', countsAttendance: true, countPerSession: false, colour: null });
    expect(checkSubjectForm({ ...newSubjectForm(), name: 'Library', shortName: '  ' }).input!.shortName).toBeNull();
  });

  it('checks the name lengths', () => {
    expect(checkSubjectForm(newSubjectForm()).errors).toEqual({ name: 'Enter the subject name' });
    expect(checkSubjectForm({ ...newSubjectForm(), name: 'CN', shortName: 'x'.repeat(13) }).errors).toEqual({ shortName: 'Short name must be at most 12 characters' });
  });

  it('stops counting Other subjects, and counts again when switched back', () => {
    const other = withKind(newSubjectForm(), 'other');
    expect(other.countsAttendance).toBe(false);
    expect(withKind(other, 'lab').countsAttendance).toBe(true);
    expect(withKind({ ...newSubjectForm(), countsAttendance: false }, 'lab').countsAttendance).toBe(false);
  });

  it('describes a subject in one line', () => {
    const lab: Subject = { id: 1, timetableId: 1, name: 'CN Lab', shortName: null, kind: 'lab', countsAttendance: true, countPerSession: false, colour: '#2563eb', archived: false };
    expect(subjectNote(lab)).toBe('Lab');
    expect(subjectNote({ ...lab, countPerSession: true })).toBe('Lab · each class counts as 1');
    expect(subjectNote({ ...lab, kind: 'other', countsAttendance: false, archived: true })).toBe('Other · not counted · archived');
    expect(subjectFormFrom(lab)).toMatchObject({ shortName: '', colour: '#2563eb' });
  });
});
