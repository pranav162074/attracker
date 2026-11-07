import type { ClassStatus, Line, OverviewItem, TodayClass, Zone } from './api.ts';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const formatDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[month! - 1]}`;
};

export const localDate = (now: Date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const formatClock = (clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number);
  if (hours === 24 || hours === 0) return `12:${String(minutes).padStart(2, '0')} am`;
  const suffix = hours! >= 12 ? 'pm' : 'am';
  const twelve = hours! > 12 ? hours! - 12 : hours!;
  return `${twelve}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const plural = (count: number, one: string, many = `${one}es`) => `${count} ${count === 1 ? one : many}`;

export const classes = (count: number) => plural(count, 'class');

export const amount = (count: number, unitsPerClass = 1, round: 'down' | 'up' = 'down') => {
  if (unitsPerClass <= 1) return classes(count);
  const sessions = round === 'down' ? Math.floor(count / unitsPerClass) : Math.ceil(count / unitsPerClass);
  const periods = `${count} ${count === 1 ? 'period' : 'periods'}`;
  if (sessions === 0) return `${periods}, less than one full session`;
  return `${periods} (${sessions} ${sessions === 1 ? 'session' : 'sessions'})`;
};

export const lineMessage = (line: Line | null | undefined, unitsPerClass = 1) => {
  if (!line) return null;
  const target = `${line.percent}%`;
  if (line.met && line.canMiss > 0) return `You can miss ${amount(line.canMiss, unitsPerClass)} and stay at ${target} or above.`;
  if (line.met) return `You are just at ${target}. Missing the next class takes you below it.`;
  if (line.reachable === false) return `${target} can no longer be reached this term.`;
  if (line.need === null) return null;
  if (line.need === 1) return `Attend the next ${unitsPerClass > 1 ? 'period' : 'class'} to get back to ${target}.`;
  return `Attend the next ${amount(line.need, unitsPerClass, 'up')} to get back to ${target}.`;
};

export const requiredMessage = (line: Line | null) => lineMessage(line);

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export const zoneBadge = (zone: Zone): { label: string; tone: Tone } | null => {
  if (zone === 'safe') return { label: 'On track', tone: 'good' };
  if (zone === 'condonation') return { label: 'Condonation', tone: 'warn' };
  if (zone === 'below') return { label: 'Below minimum', tone: 'bad' };
  return null;
};

export const overviewLine = (item: OverviewItem) => {
  if (item.status === 'setup') return 'Setup is not finished yet. Tracking starts when you press Start tracking.';
  if (item.held === 0) return 'No classes have been held yet.';
  return `${item.attended} of ${item.held} attended`;
};

export const statusText = (item: Pick<TodayClass, 'status' | 'counts' | 'tracking'>) => {
  if (!item.tracking) return 'Not tracking yet';
  if (item.status === 'cancelled') return 'Cancelled';
  if (!item.counts) return 'Does not count';
  const labels: Record<ClassStatus, string> = { attended: 'Present', absent: 'Absent', cancelled: 'Cancelled', upcoming: 'Upcoming' };
  return labels[item.status];
};

export const statusTone = (item: Pick<TodayClass, 'status' | 'counts' | 'tracking'>): Tone => {
  if (!item.tracking || !item.counts || item.status === 'cancelled' || item.status === 'upcoming') return 'neutral';
  return item.status === 'absent' ? 'bad' : 'good';
};

export const classTitle = (item: Pick<TodayClass, 'subjectName' | 'units'>) => {
  const name = item.subjectName ?? 'Class';
  return item.units > 1 ? `${name} (${item.units} periods)` : name;
};
