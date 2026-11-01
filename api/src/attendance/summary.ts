import { dayPlan, formatPercent, summarize } from '@attracker/engine';
import type { LineResult, Tally } from '@attracker/engine';
import { query } from '../db/pool.ts';
import { toClock } from '../grid/time.ts';
import { loadEngineInput, nowIn } from './load.ts';

const percentOf = (value: number | null) => (value === null ? null : value / 100);

const lines = (items: LineResult[]) =>
  items.map((line) => ({
    name: line.name,
    percent: line.bp / 100,
    met: line.met,
    canMiss: line.canMiss,
    need: line.need,
    reachable: line.reachable,
  }));

const tally = (row: Tally) => ({
  held: row.held,
  attended: row.attended,
  missed: row.missed,
  percent: percentOf(row.percent),
  percentText: formatPercent(row.percent),
  remaining: row.remaining,
  best: percentOf(row.best),
  bestText: row.best === null ? null : formatPercent(row.best),
  lines: lines(row.lines),
});

type SubjectInfo = {
  id: number;
  name: string;
  short_name: string | null;
  kind: string;
  colour: string | null;
  archived: boolean;
  units_per_class: number | null;
};

export const timetableSummary = async (userId: number, timetableId: number, asOf?: string) => {
  const { timetable, input } = await loadEngineInput(userId, timetableId, asOf);
  const result = summarize(input);
  const info = await query<SubjectInfo>(
    `SELECT s.id, s.name, s.short_name, s.kind, s.colour, s.archived_at IS NOT NULL AS archived,
            CASE WHEN s.count_per_session THEN 1 ELSE
              (SELECT g.periods FROM grid_slots g WHERE g.subject_id = s.id GROUP BY g.periods ORDER BY count(*) DESC, g.periods LIMIT 1)
            END AS units_per_class
       FROM subjects s WHERE s.timetable_id = $1`,
    [timetableId]
  );
  const byId = new Map(info.map((row) => [row.id, row]));
  const subjects = result.subjects
    .map((row) => ({ row, subject: byId.get(row.subjectId)! }))
    .filter(({ row, subject }) => !subject.archived || row.held > 0)
    .map(({ row, subject }) => ({
      subjectId: row.subjectId,
      name: subject.name,
      shortName: subject.short_name,
      kind: subject.kind,
      colour: subject.colour,
      archived: subject.archived,
      unitsPerClass: subject.units_per_class ?? 1,
      ...tally(row),
    }));

  return {
    timetableId,
    status: timetable.tracking ? ('tracking' as const) : ('setup' as const),
    asOf: { date: result.asOf.date, time: result.asOf.minute >= 1440 ? '24:00' : toClock(result.asOf.minute) },
    checkpoint: input.checkpoint ? { asOf: input.checkpoint.asOf } : null,
    overall: {
      ...tally(result.overall),
      zone: result.overall.zone,
      freeHeld: result.overall.freeHeld,
      freeAttended: result.overall.freeAttended,
    },
    subjects,
  };
};

const activeTimetables = (userId: number) =>
  query<{ id: number; name: string; time_zone: string }>(
    'SELECT id, name, time_zone FROM timetables WHERE user_id = $1 AND archived_at IS NULL ORDER BY created_at, id',
    [userId]
  );

export const overview = async (userId: number) => {
  const timetables = await activeTimetables(userId);
  return Promise.all(
    timetables.map(async (timetable) => {
      const summary = await timetableSummary(userId, timetable.id);
      return {
        timetableId: timetable.id,
        name: timetable.name,
        status: summary.status,
        percent: summary.overall.percent,
        percentText: summary.overall.percentText,
        zone: summary.overall.zone,
        held: summary.overall.held,
        attended: summary.overall.attended,
        required: summary.overall.lines.find((line) => line.name === 'required') ?? null,
      };
    })
  );
};

export const today = async (userId: number) => {
  const timetables = await activeTimetables(userId);
  const days = await Promise.all(
    timetables.map(async (timetable) => {
      const { timetable: info, input } = await loadEngineInput(userId, timetable.id);
      const date = nowIn(timetable.time_zone).date;
      const plan = dayPlan(input, date);
      return plan.occurrences.map((occurrence) => ({
        timetableId: timetable.id,
        timetableName: timetable.name,
        tracking: info.tracking,
        date,
        dayKind: plan.kind,
        key: occurrence.key,
        slotId: occurrence.slotId,
        extraId: occurrence.extraId,
        subjectId: occurrence.subjectId,
        start: toClock(occurrence.startMinute),
        end: toClock(occurrence.endMinute),
        units: occurrence.units,
        counts: occurrence.counts,
        status: occurrence.status,
      }));
    })
  );
  const subjectIds = [...new Set(days.flat().map((item) => item.subjectId))];
  const names = subjectIds.length
    ? await query<{ id: number; name: string; short_name: string | null; colour: string | null }>(
        'SELECT id, name, short_name, colour FROM subjects WHERE id = ANY($1::bigint[])',
        [subjectIds]
      )
    : [];
  const byId = new Map(names.map((row) => [row.id, row]));
  return days
    .flat()
    .map((item) => ({ ...item, subjectName: byId.get(item.subjectId)?.name ?? null, shortName: byId.get(item.subjectId)?.short_name ?? null, colour: byId.get(item.subjectId)?.colour ?? null }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.timetableId - b.timetableId));
};
