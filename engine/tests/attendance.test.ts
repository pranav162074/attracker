import { describe, it, expect } from 'vitest';
import { canMiss, dayPlan, formatPercent, needToAttend, summarize } from '../src/index.ts';
import type { EngineInput, LineResult } from '../src/index.ts';
import { HOLIDAYS, S, semV, slotAt } from './fixtures/semV.ts';

const subject = (summary: ReturnType<typeof summarize>, id: number) => summary.subjects.find((row) => row.subjectId === id)!;
const line = (tally: { lines: LineResult[] }, name: LineResult['name']) => tally.lines.find((l) => l.name === name)!;

const tiny = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  startsOn: '2026-08-03',
  endsOn: '2026-08-09',
  requiredBp: 7500,
  condonationBp: null,
  subjects: [
    { id: 1, countsAttendance: true, countPerSession: false },
    { id: 2, countsAttendance: true, countPerSession: false },
    { id: 3, countsAttendance: false, countPerSession: false },
  ],
  versions: [
    {
      effectiveFrom: '2026-08-03',
      slots: [
        { id: 11, weekday: 1, startMinute: 540, endMinute: 590, periods: 1, subjectId: 1 },
        { id: 12, weekday: 1, startMinute: 600, endMinute: 750, periods: 3, subjectId: 2 },
        { id: 13, weekday: 1, startMinute: 800, endMinute: 850, periods: 1, subjectId: 3 },
        { id: 14, weekday: 2, startMinute: 540, endMinute: 590, periods: 1, subjectId: 1 },
      ],
    },
  ],
  calendar: [],
  marks: [],
  extras: [],
  checkpoint: null,
  now: { date: '2026-08-09', minute: 1440 },
  ...overrides,
});

describe('a single week', () => {
  it('counts every class as attended by default, labs by their periods, and skips non-counted ones', () => {
    const summary = summarize(tiny());
    expect(subject(summary, 1)).toMatchObject({ held: 2, attended: 2 });
    expect(subject(summary, 2)).toMatchObject({ held: 3, attended: 3 });
    expect(summary.subjects.map((row) => row.subjectId)).toEqual([1, 2]);
    expect(summary.overall).toMatchObject({ held: 5, attended: 5, percent: 10000, zone: 'safe' });
  });

  it('only counts classes that have started', () => {
    const halfway = summarize(tiny({ now: { date: '2026-08-03', minute: 600 } }));
    expect(halfway.overall).toMatchObject({ held: 4, attended: 4, remaining: 1 });
    const before = summarize(tiny({ now: { date: '2026-08-03', minute: 539 } }));
    expect(before.overall).toMatchObject({ held: 0, percent: null, remaining: 5, zone: null });
  });

  it('applies absences, cancellations and substitutions', () => {
    const summary = summarize(
      tiny({
        marks: [
          { slotId: 11, onDate: '2026-08-03', attendance: 'absent', substituteSubjectId: null },
          { slotId: 12, onDate: '2026-08-03', attendance: 'cancelled', substituteSubjectId: null },
          { slotId: 14, onDate: '2026-08-04', attendance: 'present', substituteSubjectId: 2 },
        ],
      })
    );
    expect(subject(summary, 1)).toMatchObject({ held: 1, attended: 0, missed: 1 });
    expect(subject(summary, 2)).toMatchObject({ held: 1, attended: 1 });
    expect(summary.overall).toMatchObject({ held: 2, attended: 1, percent: 5000 });
  });

  it('adds extra classes, which happen even on holidays', () => {
    const summary = summarize(
      tiny({
        calendar: [{ kind: 'holiday', startsOn: '2026-08-04', endsOn: '2026-08-04' }],
        extras: [
          { id: 1, subjectId: 1, onDate: '2026-08-04', startMinute: 600, endMinute: 650, periods: 1, attendance: 'present' },
          { id: 2, subjectId: 2, onDate: '2026-08-08', startMinute: 600, endMinute: 750, periods: 3, attendance: 'absent' },
        ],
      })
    );
    expect(subject(summary, 1)).toMatchObject({ held: 2, attended: 2 });
    expect(subject(summary, 2)).toMatchObject({ held: 6, attended: 3 });
  });

  it('counts a per-session subject as one, however many periods it lasts', () => {
    const input = tiny();
    input.subjects = input.subjects.map((s) => (s.id === 2 ? { ...s, countPerSession: true } : s));
    expect(subject(summarize(input), 2)).toMatchObject({ held: 1, attended: 1 });
  });

  it('follows another weekday, and cuts classes on half days', () => {
    const follows = summarize(tiny({ calendar: [{ kind: 'follows_weekday', startsOn: '2026-08-08', followsWeekday: 1 }] }));
    expect(subject(follows, 2).held).toBe(6);
    expect(dayPlan(tiny({ calendar: [{ kind: 'follows_weekday', startsOn: '2026-08-08', followsWeekday: 1 }] }), '2026-08-08')).toMatchObject({
      kind: 'follows_weekday',
      followsWeekday: 1,
    });

    const afternoonOff = summarize(tiny({ calendar: [{ kind: 'no_classes_after', startsOn: '2026-08-03', cutoffMinute: 600 }] }));
    expect(subject(afternoonOff, 1).held).toBe(2);
    expect(subject(afternoonOff, 2).held).toBe(0);
    const morningOff = summarize(tiny({ calendar: [{ kind: 'no_classes_before', startsOn: '2026-08-03', cutoffMinute: 600 }] }));
    expect(subject(morningOff, 1).held).toBe(1);
    expect(subject(morningOff, 2).held).toBe(3);
  });

  it('describes each day for the day view', () => {
    const input = tiny({
      calendar: [{ kind: 'holiday', startsOn: '2026-08-04', endsOn: '2026-08-04', label: 'Festival' }],
      marks: [{ slotId: 12, onDate: '2026-08-03', attendance: 'cancelled', substituteSubjectId: null }],
      now: { date: '2026-08-03', minute: 545 },
    });
    const monday = dayPlan(input, '2026-08-03');
    expect(monday.occurrences.map((o) => [o.slotId, o.status, o.counts])).toEqual([
      [11, 'attended', true],
      [12, 'cancelled', true],
      [13, 'upcoming', false],
    ]);
    expect(dayPlan(input, '2026-08-04')).toMatchObject({ kind: 'holiday', label: 'Festival', occurrences: [] });
    expect(dayPlan(input, '2026-08-10').kind).toBe('outside');
  });

  it('remembers a planned absence for a class that has not happened yet', () => {
    const input = tiny({
      marks: [{ slotId: 14, onDate: '2026-08-04', attendance: 'absent', substituteSubjectId: null }],
      now: { date: '2026-08-03', minute: 1440 },
    });
    expect(dayPlan(input, '2026-08-04').occurrences[0]).toMatchObject({ status: 'upcoming', plannedAbsent: true });
    expect(subject(summarize(input), 1)).toMatchObject({ held: 1, remaining: 1 });
  });

  it('switches to a new weekly timetable from its date', () => {
    const input = tiny();
    input.versions.push({ effectiveFrom: '2026-08-04', slots: [{ id: 21, weekday: 2, startMinute: 540, endMinute: 590, periods: 1, subjectId: 2 }] });
    const summary = summarize(input);
    expect(subject(summary, 1).held).toBe(1);
    expect(subject(summary, 2).held).toBe(4);
  });
});

describe('can miss and need to attend', () => {
  const brute = (attended: number, held: number, bp: number) => {
    let miss = 0;
    while ((attended * 10_000) / (held + miss + 1) >= bp) miss += 1;
    let need = 0;
    while (((attended + need) * 10_000) / (held + need) < bp) need += 1;
    return { miss: (attended * 10_000) / held >= bp ? miss : 0, need };
  };

  it('match a brute-force search for every small case', () => {
    for (const bp of [6500, 7500, 7550, 8000]) {
      for (let held = 1; held <= 60; held += 1) {
        for (let attended = 0; attended <= held; attended += 1) {
          const expected = brute(attended, held, bp);
          expect(canMiss(attended, held, bp), `miss ${attended}/${held}@${bp}`).toBe(expected.miss);
          expect(needToAttend(attended, held, bp), `need ${attended}/${held}@${bp}`).toBe(expected.need);
        }
      }
    }
  });

  it('say when 100% can never be reached again', () => {
    expect(needToAttend(9, 10, 10_000)).toBeNull();
    expect(needToAttend(10, 10, 10_000)).toBe(0);
  });
});

describe('GVPCE Sem V, checked against the college sheet of 30 September', () => {
  const counted = ['DWDM', 'CN', 'OOAD', 'ADSA', 'OOADL', 'CNL', 'COI', 'PCSS', 'OE'] as const;

  it('schedules exactly what the timetable and holidays allow, labs matching the sheet', () => {
    const summary = summarize(semV());
    expect(counted.map((key) => subject(summary, S[key]).held)).toEqual([39, 38, 39, 39, 30, 30, 18, 33, 29]);
    expect(subject(summary, S.OOADL).held).toBe(30);
    expect(subject(summary, S.CNL).held).toBe(30);
    expect(summary.overall.held).toBe(295);
  });

  const official = {
    asOf: '2026-09-30',
    freeHeld: 8,
    freeAttended: 8,
    subjects: [
      [S.DWDM, 32, 15], [S.CN, 26, 18], [S.OOAD, 32, 19], [S.ADSA, 28, 15], [S.OOADL, 30, 18],
      [S.CNL, 30, 27], [S.COI, 16, 10], [S.PCSS, 21, 9], [S.OE, 23, 11],
    ].map(([subjectId, held, attended]) => ({ subjectId: subjectId!, held: held!, attended: attended! })),
  };

  it('reproduces the official sheet exactly: 246 held, 150 attended, 60.97%', () => {
    const summary = summarize(semV({ checkpoint: official }));
    expect(summary.overall).toMatchObject({ held: 246, attended: 150, freeHeld: 8, zone: 'below' });
    expect(formatPercent(summary.overall.percent)).toBe('60.97');
    expect(counted.map((key) => formatPercent(subject(summary, S[key]).percent))).toEqual([
      '46.87', '69.23', '59.37', '53.57', '60.00', '90.00', '62.50', '42.85', '47.82',
    ]);
  });

  it('gives the outlook to 14 November that was worked out by hand on 30 September', () => {
    const summary = summarize(semV({ checkpoint: official }));
    expect(counted.map((key) => subject(summary, S[key]).remaining)).toEqual([25, 24, 25, 24, 18, 15, 13, 18, 19]);
    expect(summary.overall.remaining).toBe(181);
    expect(formatPercent(summary.overall.best)).toBe('77.51');

    expect(line(summary.overall, 'required')).toMatchObject({ need: 138, reachable: true, met: false, canMiss: 0 });
    expect(line(summary.overall, 'condonation')).toMatchObject({ need: 29, reachable: true, met: false });

    expect(line(subject(summary, S.DWDM), 'required')).toMatchObject({ need: 36, reachable: false });
    expect(line(subject(summary, S.CN), 'required')).toMatchObject({ need: 6, reachable: true });
    expect(line(subject(summary, S.CNL), 'required')).toMatchObject({ need: 0, met: true, canMiss: 6 });
    expect(formatPercent(subject(summary, S.ADSA).best)).toBe('75.00');
  });

  it('keeps counting from the timetable after the checkpoint, with the student’s own marks', () => {
    const monday = slotAt(1, 720);
    const summary = summarize(
      semV({
        checkpoint: official,
        now: { date: '2026-10-07', minute: 1440 },
        marks: [
          { slotId: monday.id, onDate: '2026-10-05', attendance: 'absent', substituteSubjectId: null },
          { slotId: monday.id, onDate: '2026-09-28', attendance: 'absent', substituteSubjectId: null },
        ],
      })
    );
    const dwdm = subject(summary, S.DWDM);
    expect(dwdm).toMatchObject({ held: 32 + 3, attended: 15 + 2 });
    expect(summary.overall.held + summary.overall.remaining!).toBe(246 + 181);
  });

  it('ignores days covered by the checkpoint, and drops a later holiday from what is left', () => {
    const summary = summarize(semV({ checkpoint: official, calendar: [...HOLIDAYS, { kind: 'holiday', startsOn: '2026-09-28', endsOn: '2026-10-01' }] }));
    expect(summary.overall.held).toBe(246);
    expect(summary.overall.remaining).toBe(181 - 6);
  });
});
