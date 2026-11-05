import { describe, it, expect } from 'vitest';
import type { Line, SubjectTally } from '../src/lib/api.ts';
import { condonationMessage, findLine, missedLine, outlookMessage, sourceNote, subjectCount, subjectsFrom, subjectsNote, subjectTone } from '../src/lib/dashboard.ts';
import { amount, lineMessage } from '../src/lib/format.ts';

const required = (values: Partial<Line>): Line => ({ name: 'required', percent: 75, met: false, canMiss: 0, need: 0, reachable: true, ...values });
const condonation = (values: Partial<Line>): Line => ({ name: 'condonation', percent: 65, met: false, canMiss: 0, need: 0, reachable: true, ...values });

const september = { lines: [required({ need: 138 }), condonation({ need: 29 })], remaining: 181, bestText: '77.51', missed: 96, held: 246 };

const subject = (values: Partial<SubjectTally>): SubjectTally => ({
  subjectId: 1,
  name: 'Computer Networks Lab',
  shortName: null,
  kind: 'lab',
  colour: null,
  archived: false,
  unitsPerClass: 3,
  held: 30,
  attended: 27,
  missed: 3,
  percent: 90,
  percentText: '90.00',
  remaining: 15,
  best: null,
  bestText: null,
  lines: [required({ met: true, canMiss: 6 })],
  ...values,
});

describe('the overall card, with the real September sheet', () => {
  it('says how far below 75% you are', () => {
    expect(lineMessage(findLine(september, 'required'))).toBe('Attend the next 138 classes to get back to 75%.');
  });

  it('explains condonation when 75% is not met', () => {
    expect(condonationMessage(september)).toBe('Below 65%, the term is not allowed. Attend the next 29 classes to reach 65% for condonation.');
    expect(condonationMessage({ lines: [required({ need: 20 }), condonation({ met: true, canMiss: 12 })] })).toBe(
      'You are above 65%, so you can still pass by paying condonation. You can miss 12 classes before dropping below 65%.'
    );
    expect(condonationMessage({ lines: [required({ need: 20 }), condonation({ met: true, canMiss: 0 })] })).toBe(
      'You are just at 65%, the condonation limit. Missing the next class takes you below it.'
    );
    expect(condonationMessage({ lines: [required({ need: 9 }), condonation({ need: 1 })] })).toBe('Below 65%, the term is not allowed. Attend the next class to reach 65% for condonation.');
    expect(condonationMessage({ lines: [required({ reachable: false, need: 300 }), condonation({ reachable: false, need: 200 })] })).toBe(
      '65% for condonation can no longer be reached either.'
    );
  });

  it('stays quiet about condonation when 75% is met or there is no condonation rule', () => {
    expect(condonationMessage({ lines: [required({ met: true, canMiss: 4 }), condonation({ met: true, canMiss: 40 })] })).toBeNull();
    expect(condonationMessage({ lines: [required({ need: 3 })] })).toBeNull();
    expect(condonationMessage({ lines: [] })).toBeNull();
  });

  it('gives the best you can still reach', () => {
    expect(outlookMessage(september)).toBe('181 classes left this term. Attending all of them takes you to 77.51%.');
    expect(outlookMessage({ remaining: 1, bestText: '75.10' })).toBe('1 class left this term. Attending all of them takes you to 75.10%.');
    expect(outlookMessage({ remaining: 0, bestText: '60.97' })).toBe('No classes are left this term.');
    expect(outlookMessage({ remaining: null, bestText: null })).toBeNull();
  });

  it('counts what was missed and says where the numbers come from', () => {
    expect(missedLine(september)).toBe('Missed 96 classes');
    expect(missedLine({ missed: 0, held: 10 })).toBeNull();
    expect(sourceNote({ checkpoint: { asOf: '2026-09-30', overallOnly: false } })).toBe('Uses the official numbers up to 30 Sep 2026, then your own marks.');
    expect(sourceNote({ checkpoint: { asOf: '2026-10-31', overallOnly: true } })).toBe('Uses the official overall percentage up to 31 Oct 2026, then your own marks.');
    expect(sourceNote({ checkpoint: null })).toBeNull();
  });

  it('says subjects count from the next day when only the overall is official', () => {
    const overallOnly = { checkpoint: { asOf: '2026-10-31', overallOnly: true } };
    expect(subjectsFrom(overallOnly)).toBe('2026-11-01');
    expect(subjectsNote(overallOnly)).toBe('The official numbers up to 31 Oct 2026 are for the overall only, so each subject counts from 1 Nov 2026.');
    expect(subjectsFrom({ checkpoint: { asOf: '2026-10-31', overallOnly: false } })).toBeNull();
    expect(subjectsNote({ checkpoint: null })).toBeNull();
  });
});

describe('subjects', () => {
  it('counts labs in periods and in whole sessions', () => {
    expect(amount(6, 3)).toBe('6 periods (2 sessions)');
    expect(amount(7, 3)).toBe('7 periods (2 sessions)');
    expect(amount(7, 3, 'up')).toBe('7 periods (3 sessions)');
    expect(amount(3, 3)).toBe('3 periods (1 session)');
    expect(amount(2, 3)).toBe('2 periods, less than one full session');
    expect(amount(1, 1)).toBe('1 class');
    expect(lineMessage(required({ met: true, canMiss: 6 }), 3)).toBe('You can miss 6 periods (2 sessions) and stay at 75% or above.');
    expect(lineMessage(required({ need: 36, reachable: true }), 1)).toBe('Attend the next 36 classes to get back to 75%.');
    expect(lineMessage(required({ need: 36, reachable: false }), 1)).toBe('75% can no longer be reached this term.');
  });

  it('shows the counts', () => {
    expect(subjectCount(subject({}))).toBe('27 of 30 periods');
    expect(subjectCount(subject({ unitsPerClass: 1, held: 26, attended: 18 }))).toBe('18 of 26');
    expect(subjectCount(subject({ held: 0, attended: 0 }))).toBe('No classes yet');
    expect(subjectCount(subject({ unitsPerClass: 1, held: 12, attended: 10 }), '2026-11-01')).toBe('Since 1 Nov 2026: 10 of 12');
    expect(subjectCount(subject({ held: 0, attended: 0 }), '2026-11-01')).toBe('No classes since 1 Nov 2026 yet');
  });

  it('colours a subject by which line it is above', () => {
    expect(subjectTone(subject({}))).toBe('good');
    expect(subjectTone(subject({ lines: [required({ need: 5 }), condonation({ met: true, canMiss: 2 })] }))).toBe('warn');
    expect(subjectTone(subject({ lines: [required({ need: 36 }), condonation({ need: 10 })] }))).toBe('bad');
    expect(subjectTone(subject({ lines: [required({ need: 36 })] }))).toBe('bad');
    expect(subjectTone(subject({ lines: [] }))).toBe('neutral');
    expect(subjectTone(subject({ held: 0 }))).toBe('neutral');
  });
});
