import { formatClock } from './format.ts';

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type ServerSlot = { id?: number; weekday: number; start: string; end: string; periods: number; subjectId: number };

export type DraftSlot = { key: string; weekday: number; start: number; end: number; periods: number; subjectId: number };

let counter = 0;
export const newKey = () => {
  counter += 1;
  return `draft-${counter}`;
};

export const clockToMinutes = (clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours! * 60 + minutes!;
};

export const minutesToClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const showTime = (minutes: number) => formatClock(minutesToClock(minutes));

export const parseTime = (text: string): number | null => {
  const cleaned = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(cleaned) ?? /^(\d{1,2})(\d{2})\s*(am|pm)?$/.exec(cleaned);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const suffix = match[3]?.replace(/\./g, '');
  if (minutes > 59) return null;
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    if (suffix === 'am') hours = hours === 12 ? 0 : hours;
    else hours = hours === 12 ? 12 : hours + 12;
  } else {
    if (hours > 23) return null;
    if (hours >= 1 && hours <= 6) hours += 12;
  }
  return hours * 60 + minutes;
};

export const fromServer = (slots: ServerSlot[]): DraftSlot[] =>
  slots.map((slot) => ({
    key: slot.id === undefined ? newKey() : `slot-${slot.id}`,
    weekday: slot.weekday,
    start: clockToMinutes(slot.start),
    end: clockToMinutes(slot.end),
    periods: slot.periods,
    subjectId: slot.subjectId,
  }));

export const toServer = (draft: DraftSlot[]) =>
  [...draft]
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start)
    .map((slot) => ({ weekday: slot.weekday, start: minutesToClock(slot.start), end: minutesToClock(slot.end), periods: slot.periods, subjectId: slot.subjectId }));

export const slotsOn = (draft: DraftSlot[], weekday: number) => draft.filter((slot) => slot.weekday === weekday).sort((a, b) => a.start - b.start);

export const dayCounts = (draft: DraftSlot[]) => WEEKDAY_NAMES.map((_, index) => draft.filter((slot) => slot.weekday === index + 1).length);

export const periodLength = (draft: DraftSlot[]) => {
  const counts = new Map<number, number>();
  for (const slot of draft) {
    if (slot.periods !== 1) continue;
    const length = slot.end - slot.start;
    counts.set(length, (counts.get(length) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [length, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && length < best)) {
      best = length;
      bestCount = count;
    }
  }
  return best;
};

export const guessPeriods = (start: number, end: number, draft: DraftSlot[]) => {
  const length = periodLength(draft);
  if (!length || end <= start) return 1;
  return Math.min(12, Math.max(1, Math.round((end - start) / length)));
};

export const suggestNext = (draft: DraftSlot[], weekday: number) => {
  const length = periodLength(draft) ?? 50;
  const today = slotsOn(draft, weekday);
  const last = today.at(-1);
  if (last) {
    const start = last.end;
    return start + length <= 1440 ? { start, end: start + length } : null;
  }
  const earliest = draft.length > 0 ? Math.min(...draft.map((slot) => slot.start)) : null;
  if (earliest === null) return null;
  return { start: earliest, end: earliest + length };
};

export type ClassForm = { subjectId: number | null; start: string; end: string; periods: number };

export const classFormFor = (slot: DraftSlot | null, suggestion: { start: number; end: number } | null): ClassForm => {
  if (slot) return { subjectId: slot.subjectId, start: showTime(slot.start), end: showTime(slot.end), periods: slot.periods };
  return { subjectId: null, start: suggestion ? showTime(suggestion.start) : '', end: suggestion ? showTime(suggestion.end) : '', periods: 1 };
};

export const checkClass = (form: ClassForm, weekday: number, draft: DraftSlot[], editingKey: string | null) => {
  const errors: Record<string, string> = {};
  const start = parseTime(form.start);
  const end = parseTime(form.end);
  if (form.subjectId === null) errors.subject = 'Choose a subject';
  if (start === null) errors.start = form.start.trim() ? 'Enter a time like 8:40 or 1:30 pm' : 'Enter the start time';
  if (end === null) errors.end = form.end.trim() ? 'Enter a time like 9:30 or 2:20 pm' : 'Enter the end time';
  if (start !== null && end !== null && end <= start) errors.end = 'Must be after the start time';
  if (start !== null && end !== null && end > start && !errors.subject) {
    const clash = slotsOn(draft, weekday).find((slot) => slot.key !== editingKey && start < slot.end && slot.start < end);
    if (clash) errors.start = `Overlaps the ${showTime(clash.start)} to ${showTime(clash.end)} class`;
  }
  if (Object.keys(errors).length > 0) return { slot: null, errors };
  return {
    slot: { key: editingKey ?? newKey(), weekday, start: start!, end: end!, periods: form.periods, subjectId: form.subjectId! },
    errors,
  };
};

export const replaceSlot = (draft: DraftSlot[], slot: DraftSlot) =>
  draft.some((item) => item.key === slot.key) ? draft.map((item) => (item.key === slot.key ? slot : item)) : [...draft, slot];

export const copyDay = (draft: DraftSlot[], from: number, to: number) => [
  ...draft.filter((slot) => slot.weekday !== to),
  ...slotsOn(draft, from).map((slot) => ({ ...slot, key: newKey(), weekday: to })),
];

export const sameGrid = (a: DraftSlot[], b: DraftSlot[]) => JSON.stringify(toServer(a)) === JSON.stringify(toServer(b));

export const archivedInUse = (draft: DraftSlot[], archivedIds: Set<number>) => [...new Set(draft.filter((slot) => archivedIds.has(slot.subjectId)).map((slot) => slot.subjectId))];
