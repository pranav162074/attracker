import { describe, it, expect } from 'vitest';
import { checkCode, cleanCode, previewLines, shareMessage } from '../src/lib/share.ts';

const preview = {
  code: '7K3P-Q9M2',
  name: 'Sem 5',
  startsOn: '2026-07-20',
  endsOn: '2026-11-18',
  requiredPercent: 75,
  condonationPercent: 65,
  subjects: [
    { name: 'Computer Networks', kind: 'theory' as const, countsAttendance: true },
    { name: 'CN Lab', kind: 'lab' as const, countsAttendance: true },
    { name: 'Counselling', kind: 'other' as const, countsAttendance: false },
  ],
  classesPerWeek: 24,
  specialDays: 14,
};

describe('typing a share code', () => {
  it('accepts it with or without the dash, in any case', () => {
    expect(checkCode('7k3p-q9m2')).toEqual({ code: '7K3P-Q9M2', error: null });
    expect(checkCode(' 7K3P Q9M2 ')).toEqual({ code: '7K3P-Q9M2', error: null });
    expect(cleanCode('7k3p-q9m2')).toBe('7K3PQ9M2');
  });

  it('says what is wrong', () => {
    expect(checkCode('')).toEqual({ code: null, error: 'Enter the code your classmate shared' });
    expect(checkCode('7K3P-Q9M')).toEqual({ code: null, error: 'A code is 8 letters and numbers, like 7K3P-Q9M2' });
    expect(checkCode('7K3P-Q9M0').error).toBe('A code is 8 letters and numbers, like 7K3P-Q9M2');
  });
});

describe('the preview before copying', () => {
  it('sums up what will be copied', () => {
    expect(previewLines(preview)).toEqual([
      '20 Jul 2026 to 18 Nov 2026',
      '75% required, condonation from 65%',
      '2 subjects counted, 1 not counted',
      '24 classes a week',
      '14 holidays and special days',
    ]);
    expect(previewLines({ ...preview, endsOn: null, requiredPercent: null, condonationPercent: null, subjects: preview.subjects.slice(0, 1), classesPerWeek: 1, specialDays: 0 })).toEqual([
      'From 20 Jul 2026',
      'No minimum attendance',
      '1 subject counted',
      '1 class a week',
      'No holidays added',
    ]);
  });

  it('writes the message to send', () => {
    expect(shareMessage('7K3P-Q9M2', 'Sem 5')).toBe(
      'Copy my Sem 5 timetable on attracker: when you set up a new semester, choose "Copy a classmate’s timetable" and enter the code 7K3P-Q9M2'
    );
  });
});
