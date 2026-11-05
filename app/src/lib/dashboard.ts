import type { Line, Summary, SubjectTally, Tally } from './api.ts';
import { formatDate } from './dates.ts';
import { amount, classes } from './format.ts';
import { shiftDay } from './day.ts';

export const findLine = (tally: Pick<Tally, 'lines'>, name: Line['name']) => tally.lines.find((line) => line.name === name) ?? null;

export const condonationMessage = (tally: Pick<Tally, 'lines'>) => {
  const required = findLine(tally, 'required');
  const condonation = findLine(tally, 'condonation');
  if (!condonation || !required || required.met) return null;
  const target = `${condonation.percent}%`;
  if (condonation.met && condonation.canMiss > 0) {
    return `You are above ${target}, so you can still pass by paying condonation. You can miss ${classes(condonation.canMiss)} before dropping below ${target}.`;
  }
  if (condonation.met) return `You are just at ${target}, the condonation limit. Missing the next class takes you below it.`;
  if (condonation.reachable === false) return `${target} for condonation can no longer be reached either.`;
  if (condonation.need === null) return null;
  if (condonation.need === 1) return `Below ${target}, the term is not allowed. Attend the next class to reach ${target} for condonation.`;
  return `Below ${target}, the term is not allowed. Attend the next ${classes(condonation.need)} to reach ${target} for condonation.`;
};

export const outlookMessage = (tally: Pick<Tally, 'remaining' | 'bestText'>) => {
  if (tally.remaining === null) return null;
  if (tally.remaining === 0) return 'No classes are left this term.';
  return `${classes(tally.remaining)} left this term. Attending all of them takes you to ${tally.bestText}%.`;
};

export const sourceNote = (summary: Pick<Summary, 'checkpoint'>) => {
  if (!summary.checkpoint) return null;
  const date = formatDate(summary.checkpoint.asOf);
  return summary.checkpoint.overallOnly ? `Uses the official overall percentage up to ${date}, then your own marks.` : `Uses the official numbers up to ${date}, then your own marks.`;
};

export const subjectsFrom = (summary: Pick<Summary, 'checkpoint'>) => (summary.checkpoint?.overallOnly ? shiftDay(summary.checkpoint.asOf, 1) : null);

export const subjectsNote = (summary: Pick<Summary, 'checkpoint'>) => {
  const from = subjectsFrom(summary);
  if (!from) return null;
  return `The official numbers up to ${formatDate(summary.checkpoint!.asOf)} are for the overall only, so each subject counts from ${formatDate(from)}.`;
};

export const subjectCount = (row: Pick<SubjectTally, 'held' | 'attended' | 'unitsPerClass'>, since: string | null = null) => {
  if (row.held === 0) return since ? `No classes since ${formatDate(since)} yet` : 'No classes yet';
  const count = row.unitsPerClass > 1 ? `${row.attended} of ${row.held} periods` : `${row.attended} of ${row.held}`;
  return since ? `Since ${formatDate(since)}: ${count}` : count;
};

export const subjectTone = (row: Pick<SubjectTally, 'held' | 'lines'>) => {
  if (row.held === 0) return 'neutral' as const;
  const required = findLine(row, 'required');
  const condonation = findLine(row, 'condonation');
  if (!required) return 'neutral' as const;
  if (required.met) return 'good' as const;
  if (condonation?.met) return 'warn' as const;
  return 'bad' as const;
};

export const missedLine = (tally: Pick<Tally, 'missed' | 'held'>, unitsPerClass = 1) => (tally.held === 0 || tally.missed === 0 ? null : `Missed ${amount(tally.missed, unitsPerClass)}`);
