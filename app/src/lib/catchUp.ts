import type { DayOverview, Timetable } from './api.ts';
import { formatDate, parseIso } from './dates.ts';
import { shiftDay } from './day.ts';

export const MAX_CATCH_UP_DAYS = 62;

export type CatchUp = {
  kind: 'gap' | 'late';
  from: string;
  to: string;
  startsOn: string;
  startedOn: string;
  asOf: string | null;
};

export const findCatchUp = (timetable: Pick<Timetable, 'startsOn' | 'endsOn' | 'trackingStartedOn'>, asOf: string | null): CatchUp | null => {
  const startedOn = timetable.trackingStartedOn;
  if (!startedOn) return null;
  const from = asOf ? shiftDay(asOf, 1) : timetable.startsOn;
  let to = shiftDay(startedOn, -1);
  if (timetable.endsOn && to > timetable.endsOn) to = timetable.endsOn;
  if (from < timetable.startsOn || to < from) return null;
  return { kind: asOf ? 'gap' : 'late', from, to, startsOn: timetable.startsOn, startedOn, asOf };
};

const dayNumber = (iso: string) => {
  const { year, month, day } = parseIso(iso);
  return Date.UTC(year, month, day) / 86_400_000;
};

export const spanDays = (catchUp: Pick<CatchUp, 'from' | 'to'>) => dayNumber(catchUp.to) - dayNumber(catchUp.from) + 1;

export const canCount = (catchUp: Pick<CatchUp, 'from' | 'to'>) => spanDays(catchUp) <= MAX_CATCH_UP_DAYS;

export const classDays = (days: Pick<DayOverview, 'classes'>[]) => days.filter((day) => day.classes > 0).length;

export const catchUpKey = (catchUp: Pick<CatchUp, 'from' | 'to'>) => `${catchUp.from}:${catchUp.to}`;

const range = ({ from, to }: Pick<CatchUp, 'from' | 'to'>) => (from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`);

const daysWithClasses = (count: number) => (count === 1 ? '1 day in between has classes. ' : `${count} days in between have classes. `);

export const catchUpText = (catchUp: CatchUp, withClasses: number | null) => {
  if (catchUp.kind === 'gap') {
    return {
      title: `Check ${range(catchUp)}`,
      body: `The official numbers go up to ${formatDate(catchUp.asOf!)} and you started using attracker on ${formatDate(catchUp.startedOn)}. ${withClasses === null ? '' : daysWithClasses(withClasses)}Those classes count as attended until you mark them, so mark any you missed.`,
    };
  }
  return {
    title: `Classes before ${formatDate(catchUp.startedOn)}`,
    body: `The semester began on ${formatDate(catchUp.startsOn)}, but you started using attracker on ${formatDate(catchUp.startedOn)}. Classes before that count as attended. If the college has given you attendance up to some date, add it and those weeks use the college’s numbers. Otherwise mark the days you missed.`,
  };
};

export const officialDetail = (asOf: string | null) =>
  asOf ? `Using the college’s numbers up to ${formatDate(asOf)}. Add a newer sheet when you get one.` : 'Started partway through? Enter the latest attendance the college gave you.';
