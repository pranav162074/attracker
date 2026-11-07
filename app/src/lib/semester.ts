import type { DayOverview, Line, OverviewItem, SetupStep, SubjectTally, Timetable } from './api.ts';
import { formatDate } from './dates.ts';

import { shiftDay } from './day.ts';

export const pickSemester = (list: Pick<OverviewItem, 'timetableId' | 'status'>[], saved: number | null) => {
  if (list.length === 0) return null;
  if (saved !== null && list.some((item) => item.timetableId === saved)) return saved;
  return (list.find((item) => item.status === 'tracking') ?? list[0]!).timetableId;
};

export const parseSaved = (text: string | null) => {
  const value = Number(text);
  return text && Number.isInteger(value) && value > 0 ? value : null;
};

export const SETUP_STEPS = 5;

export type SetupRoute = 'details' | 'subjects' | 'grid' | 'calendar' | 'started';

export const SETUP_ORDER: SetupRoute[] = ['details', 'subjects', 'grid', 'calendar', 'started'];

export const stepNumber = (route: SetupRoute) => SETUP_ORDER.indexOf(route) + 1;

export const resumeStep = (steps: Pick<SetupStep, 'key' | 'done'>[]): SetupRoute => {
  const done = (key: SetupStep['key']) => steps.find((step) => step.key === key)?.done ?? false;
  if (!done('dates')) return 'details';
  if (!done('subjects')) return 'subjects';
  if (!done('grid')) return 'grid';
  return 'started';
};

export const setupPath = (timetableId: number, route: SetupRoute) => (route === 'started' ? `/timetables/${timetableId}/started` : `/timetables/${timetableId}/${route}?setup=1`);

export const neighbourStep = (route: SetupRoute, by: 1 | -1) => SETUP_ORDER[SETUP_ORDER.indexOf(route) + by] ?? null;

export const blockedBy = (route: SetupRoute, steps: Pick<SetupStep, 'key' | 'done'>[]) => {
  const done = (key: SetupStep['key']) => steps.find((step) => step.key === key)?.done ?? false;
  if (route === 'subjects' && !done('subjects')) return 'Add at least one subject that counts for attendance first.';
  if (route === 'grid' && !done('grid')) return 'Add at least one class to the weekly timetable first.';
  return null;
};

export const uncheckedDay = (days: Pick<DayOverview, 'date' | 'kind' | 'classes' | 'absent' | 'swapped' | 'extra'>[], startedOn: string | null, checkedThrough: string | null) => {
  if (!startedOn) return null;
  const floor = checkedThrough && checkedThrough >= startedOn ? checkedThrough : shiftDay(startedOn, -1);
  const last = [...days].reverse().find((day) => day.kind !== 'outside' && day.classes > 0);
  if (!last || last.date <= floor) return null;
  if (last.absent > 0 || last.swapped > 0 || last.extra > 0) return null;
  return { date: last.date, classes: last.classes };
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const weekdayOf = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]!;
};

export const uncheckedText = (unchecked: { date: string; classes: number }, today: string) => {
  const when = unchecked.date === shiftDay(today, -1) ? 'Yesterday' : `${weekdayOf(unchecked.date)}, ${formatDate(unchecked.date)},`;
  const count = unchecked.classes === 1 ? '1 class' : `${unchecked.classes} classes`;
  return `${when} had ${count}. Did you miss any?`;
};

export const nextClassDay = (days: Pick<DayOverview, 'date' | 'kind' | 'classes'>[]) => days.find((day) => day.kind !== 'outside' && day.classes > 0)?.date ?? null;

export const noClassesText = (kind: DayOverview['kind'] | 'normal', label: string | null, next: string | null) => {
  const why = kind === 'holiday' ? (label ? `${label}, a holiday.` : 'A holiday.') : kind === 'outside' ? 'Outside the semester’s dates.' : 'Nothing on the timetable today.';
  if (!next) return why;
  return `${why} Next classes: ${weekdayOf(next)}, ${formatDate(next)}.`;
};

const count = (value: number, unitsPerClass: number) => (unitsPerClass > 1 ? `${value} ${value === 1 ? 'period' : 'periods'}` : `${value} ${value === 1 ? 'class' : 'classes'}`);

export const shortLine = (line: Line | null, unitsPerClass = 1) => {
  if (!line) return null;
  const target = `${line.percent}%`;
  if (line.met) return line.canMiss > 0 ? `Can miss ${count(line.canMiss, unitsPerClass)}` : `Just at ${target}`;
  if (line.reachable === false) return `${target} can’t be reached this term`;
  if (line.need === null) return null;
  return `Attend ${count(line.need, unitsPerClass)} to reach ${target}`;
};

export const byAttention = <T extends Pick<SubjectTally, 'percent' | 'name'>>(rows: T[]) =>
  [...rows].sort((a, b) => {
    if (a.percent === null && b.percent === null) return a.name.localeCompare(b.name);
    if (a.percent === null) return 1;
    if (b.percent === null) return -1;
    return a.percent - b.percent || a.name.localeCompare(b.name);
  });

export const datesDetail = (timetable: Pick<Timetable, 'startsOn' | 'endsOn' | 'requiredPercent' | 'condonationPercent'>) => {
  const range = timetable.endsOn ? `${formatDate(timetable.startsOn)} to ${formatDate(timetable.endsOn)}` : `From ${formatDate(timetable.startsOn)}, no end date`;
  if (timetable.requiredPercent === null) return `${range}. No minimum attendance.`;
  const condonation = timetable.condonationPercent === null ? '' : `, condonation from ${timetable.condonationPercent}%`;
  return `${range}. ${timetable.requiredPercent}% required${condonation}.`;
};
