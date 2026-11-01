import { addDays, isoWeekday } from './dates.ts';
import { percentHundredths } from './percent.ts';
import type { Hundredths } from './percent.ts';

export type EngineSubject = {
  id: number;
  countsAttendance: boolean;
  countPerSession: boolean;
};

export type EngineSlot = {
  id: number;
  weekday: number;
  startMinute: number;
  endMinute: number;
  periods: number;
  subjectId: number;
};

export type EngineVersion = { effectiveFrom: string; slots: EngineSlot[] };

export type CalendarRule =
  | { kind: 'holiday'; startsOn: string; endsOn: string; label?: string | null }
  | { kind: 'follows_weekday'; startsOn: string; followsWeekday: number; label?: string | null }
  | { kind: 'no_classes_before' | 'no_classes_after'; startsOn: string; cutoffMinute: number; label?: string | null };

export type ClassMark = {
  slotId: number;
  onDate: string;
  attendance: 'present' | 'absent' | 'cancelled';
  substituteSubjectId: number | null;
};

export type ExtraClass = {
  id: number;
  subjectId: number;
  onDate: string;
  startMinute: number;
  endMinute: number;
  periods: number;
  attendance: 'present' | 'absent';
};

export type Checkpoint = {
  asOf: string;
  freeHeld: number;
  freeAttended: number;
  subjects: Array<{ subjectId: number; held: number; attended: number }>;
};

export type Moment = { date: string; minute: number };

export type EngineInput = {
  startsOn: string;
  endsOn: string | null;
  requiredBp: number | null;
  condonationBp: number | null;
  subjects: EngineSubject[];
  versions: EngineVersion[];
  calendar: CalendarRule[];
  marks: ClassMark[];
  extras: ExtraClass[];
  checkpoint: Checkpoint | null;
  now: Moment;
};

export type ClassStatus = 'attended' | 'absent' | 'cancelled' | 'upcoming';

export type Occurrence = {
  key: string;
  date: string;
  slotId: number | null;
  extraId: number | null;
  scheduledSubjectId: number;
  subjectId: number;
  startMinute: number;
  endMinute: number;
  units: number;
  counts: boolean;
  status: ClassStatus;
  plannedAbsent: boolean;
  cancelledBy: 'mark' | 'half_day' | null;
  beforeCheckpoint: boolean;
};

export type DayKind = 'outside' | 'holiday' | 'normal' | 'follows_weekday' | 'half_day';

export type DayPlan = {
  date: string;
  kind: DayKind;
  label: string | null;
  followsWeekday: number | null;
  occurrences: Occurrence[];
};

type Indexed = {
  input: EngineInput;
  subjects: Map<number, EngineSubject>;
  versions: EngineVersion[];
  rules: Map<string, CalendarRule>;
  marks: Map<string, ClassMark>;
  extras: Map<string, ExtraClass[]>;
};

const markKey = (slotId: number, date: string) => `${slotId}|${date}`;

const index = (input: EngineInput): Indexed => {
  const rules = new Map<string, CalendarRule>();
  for (const rule of input.calendar) {
    const last = rule.kind === 'holiday' ? rule.endsOn : rule.startsOn;
    for (let date = rule.startsOn; date <= last; date = addDays(date, 1)) rules.set(date, rule);
  }
  const extras = new Map<string, ExtraClass[]>();
  for (const extra of input.extras) extras.set(extra.onDate, [...(extras.get(extra.onDate) ?? []), extra]);
  return {
    input,
    subjects: new Map(input.subjects.map((subject) => [subject.id, subject])),
    versions: [...input.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)),
    rules,
    marks: new Map(input.marks.map((mark) => [markKey(mark.slotId, mark.onDate), mark])),
    extras,
  };
};

const versionOn = (versions: EngineVersion[], date: string) => {
  let found: EngineVersion | undefined;
  for (const version of versions) {
    if (version.effectiveFrom <= date) found = version;
    else break;
  }
  return found;
};

const hasStarted = (now: Moment, date: string, startMinute: number) => date < now.date || (date === now.date && startMinute <= now.minute);

const unitsFor = (subject: EngineSubject | undefined, periods: number) => (subject?.countPerSession ? 1 : periods);

const inRange = (input: EngineInput, date: string) => date >= input.startsOn && (input.endsOn === null || date <= input.endsOn);

const planDay = (ix: Indexed, date: string): DayPlan => {
  const { input } = ix;
  if (!inRange(input, date)) return { date, kind: 'outside', label: null, followsWeekday: null, occurrences: [] };

  const rule = ix.rules.get(date);
  const beforeCheckpoint = input.checkpoint !== null && date <= input.checkpoint.asOf;
  const occurrences: Occurrence[] = [];

  const plan: DayPlan = {
    date,
    kind: 'normal',
    label: rule?.label ?? null,
    followsWeekday: null,
    occurrences,
  };

  if (rule?.kind === 'holiday') {
    plan.kind = 'holiday';
  } else {
    let weekday = isoWeekday(date);
    if (rule?.kind === 'follows_weekday') {
      plan.kind = 'follows_weekday';
      plan.followsWeekday = rule.followsWeekday;
      weekday = rule.followsWeekday;
    }
    if (rule?.kind === 'no_classes_before' || rule?.kind === 'no_classes_after') plan.kind = 'half_day';

    const version = versionOn(ix.versions, date);
    for (const slot of version?.slots ?? []) {
      if (slot.weekday !== weekday) continue;
      const mark = ix.marks.get(markKey(slot.id, date));
      const subjectId = mark?.substituteSubjectId ?? slot.subjectId;
      const subject = ix.subjects.get(subjectId);
      const halfDayOff =
        (rule?.kind === 'no_classes_before' && slot.startMinute < rule.cutoffMinute) ||
        (rule?.kind === 'no_classes_after' && slot.startMinute >= rule.cutoffMinute);
      const cancelledBy = halfDayOff ? ('half_day' as const) : mark?.attendance === 'cancelled' ? ('mark' as const) : null;
      const started = hasStarted(input.now, date, slot.startMinute);
      const status: ClassStatus = cancelledBy ? 'cancelled' : !started ? 'upcoming' : mark?.attendance === 'absent' ? 'absent' : 'attended';
      occurrences.push({
        key: `s${slot.id}@${date}`,
        date,
        slotId: slot.id,
        extraId: null,
        scheduledSubjectId: slot.subjectId,
        subjectId,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        units: unitsFor(subject, slot.periods),
        counts: subject?.countsAttendance ?? false,
        status,
        plannedAbsent: status === 'upcoming' && mark?.attendance === 'absent',
        cancelledBy,
        beforeCheckpoint,
      });
    }
  }

  for (const extra of ix.extras.get(date) ?? []) {
    const subject = ix.subjects.get(extra.subjectId);
    const started = hasStarted(input.now, date, extra.startMinute);
    occurrences.push({
      key: `x${extra.id}`,
      date,
      slotId: null,
      extraId: extra.id,
      scheduledSubjectId: extra.subjectId,
      subjectId: extra.subjectId,
      startMinute: extra.startMinute,
      endMinute: extra.endMinute,
      units: unitsFor(subject, extra.periods),
      counts: subject?.countsAttendance ?? false,
      status: !started ? 'upcoming' : extra.attendance === 'absent' ? 'absent' : 'attended',
      plannedAbsent: !started && extra.attendance === 'absent',
      cancelledBy: null,
      beforeCheckpoint,
    });
  }

  occurrences.sort((a, b) => a.startMinute - b.startMinute || a.key.localeCompare(b.key));
  return plan;
};

export const dayPlan = (input: EngineInput, date: string): DayPlan => planDay(index(input), date);

export type LineResult = {
  name: 'required' | 'condonation';
  bp: number;
  met: boolean;
  canMiss: number;
  need: number | null;
  reachable: boolean | null;
};

export type Tally = {
  held: number;
  attended: number;
  missed: number;
  percent: Hundredths | null;
  remaining: number | null;
  best: Hundredths | null;
  lines: LineResult[];
};

export type Zone = 'safe' | 'condonation' | 'below' | null;

export type Summary = {
  asOf: Moment;
  overall: Tally & { zone: Zone; freeHeld: number; freeAttended: number };
  subjects: Array<Tally & { subjectId: number }>;
};

export const canMiss = (attended: number, held: number, bp: number) => {
  if (bp <= 0) return Number.POSITIVE_INFINITY;
  const spare = attended * 10_000 - bp * held;
  return spare < 0 ? 0 : Math.floor(spare / bp);
};

export const needToAttend = (attended: number, held: number, bp: number) => {
  const deficit = bp * held - attended * 10_000;
  if (deficit <= 0) return 0;
  if (bp >= 10_000) return null;
  return Math.ceil(deficit / (10_000 - bp));
};

const lineResults = (attended: number, held: number, remaining: number | null, lines: Array<{ name: LineResult['name']; bp: number | null }>) =>
  lines
    .filter((line): line is { name: LineResult['name']; bp: number } => line.bp !== null)
    .map((line) => {
      const need = needToAttend(attended, held, line.bp);
      return {
        name: line.name,
        bp: line.bp,
        met: need === 0,
        canMiss: canMiss(attended, held, line.bp),
        need,
        reachable: remaining === null ? null : need !== null && need <= remaining,
      };
    });

const tally = (held: number, attended: number, remaining: number | null, lines: Array<{ name: LineResult['name']; bp: number | null }>): Tally => ({
  held,
  attended,
  missed: held - attended,
  percent: percentHundredths(attended, held),
  remaining,
  best: remaining === null ? null : percentHundredths(attended + remaining, held + remaining),
  lines: lineResults(attended, held, remaining, lines),
});

export const summarize = (input: EngineInput): Summary => {
  const ix = index(input);
  const checkpoint = input.checkpoint;
  const fromCheckpoint = new Map(checkpoint?.subjects.map((row) => [row.subjectId, row]) ?? []);
  const counts = new Map<number, { held: number; attended: number; remaining: number }>();
  for (const subject of input.subjects) {
    if (!subject.countsAttendance) continue;
    const official = fromCheckpoint.get(subject.id);
    counts.set(subject.id, { held: official?.held ?? 0, attended: official?.attended ?? 0, remaining: 0 });
  }

  const last = input.endsOn ?? (input.now.date > input.startsOn ? input.now.date : input.startsOn);
  for (let date = input.startsOn; date <= last; date = addDays(date, 1)) {
    for (const occurrence of planDay(ix, date).occurrences) {
      if (!occurrence.counts) continue;
      const entry = counts.get(occurrence.subjectId);
      if (!entry) continue;
      if (occurrence.beforeCheckpoint && fromCheckpoint.has(occurrence.subjectId)) continue;
      if (occurrence.status === 'attended') {
        entry.held += occurrence.units;
        entry.attended += occurrence.units;
      } else if (occurrence.status === 'absent') {
        entry.held += occurrence.units;
      } else if (occurrence.status === 'upcoming') {
        entry.remaining += occurrence.units;
      }
    }
  }

  const openEnded = input.endsOn === null;
  const subjectLines = [{ name: 'required' as const, bp: input.requiredBp }];
  const subjects = [...counts.entries()].map(([subjectId, entry]) => ({
    subjectId,
    ...tally(entry.held, entry.attended, openEnded ? null : entry.remaining, subjectLines),
  }));

  const freeHeld = checkpoint?.freeHeld ?? 0;
  const freeAttended = checkpoint?.freeAttended ?? 0;
  const held = subjects.reduce((sum, row) => sum + row.held, freeHeld);
  const attended = subjects.reduce((sum, row) => sum + row.attended, freeAttended);
  const remaining = openEnded ? null : [...counts.values()].reduce((sum, entry) => sum + entry.remaining, 0);
  const overall = tally(held, attended, remaining, [
    { name: 'required', bp: input.requiredBp },
    { name: 'condonation', bp: input.condonationBp },
  ]);

  let zone: Zone = null;
  if (input.requiredBp !== null && overall.percent !== null) {
    if (overall.percent >= input.requiredBp) zone = 'safe';
    else if (input.condonationBp !== null && overall.percent >= input.condonationBp) zone = 'condonation';
    else zone = 'below';
  }

  return { asOf: input.now, overall: { ...overall, zone, freeHeld, freeAttended }, subjects };
};
