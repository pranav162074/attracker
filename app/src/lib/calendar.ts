import type { CalendarDay, CalendarDayInput, FieldErrors, Timetable } from './api.ts';
import { formatDate, MONTHS, parseIso } from './dates.ts';
import { clockToMinutes, minutesToClock, parseTime, showTime, WEEKDAY_NAMES } from './grid.ts';

export type DayType = 'holiday' | 'half' | 'follows';
export type HalfKind = 'no_classes_after' | 'no_classes_before';

export const formatRange = (startsOn: string, endsOn: string) => {
  if (startsOn === endsOn) return formatDate(startsOn);
  const a = parseIso(startsOn);
  const b = parseIso(endsOn);
  if (a.year === b.year && a.month === b.month) return `${a.day} to ${b.day} ${MONTHS[a.month]!.slice(0, 3)} ${a.year}`;
  if (a.year === b.year) return `${a.day} ${MONTHS[a.month]!.slice(0, 3)} to ${b.day} ${MONTHS[b.month]!.slice(0, 3)} ${a.year}`;
  return `${formatDate(startsOn)} to ${formatDate(endsOn)}`;
};

const dayCount = (startsOn: string, endsOn: string) => {
  const a = parseIso(startsOn);
  const b = parseIso(endsOn);
  return Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86_400_000) + 1;
};

export const describeDay = (day: Pick<CalendarDay, 'kind' | 'startsOn' | 'endsOn' | 'followsWeekday' | 'cutoff' | 'label'>) => {
  const title = formatRange(day.startsOn, day.endsOn);
  let what: string;
  if (day.kind === 'holiday') {
    const days = dayCount(day.startsOn, day.endsOn);
    what = days > 1 ? `Holiday, ${days} days` : 'Holiday';
  } else if (day.kind === 'follows_weekday') {
    what = `Follows ${WEEKDAY_NAMES[day.followsWeekday! - 1]}’s timetable`;
  } else {
    const time = day.cutoff ? showTime(clockToMinutes(day.cutoff)) : '';
    what = day.kind === 'no_classes_after' ? `Half day, classes until ${time}` : `Half day, classes from ${time}`;
  }
  return { title, detail: day.label ? `${what} · ${day.label}` : what };
};

export type DayForm = {
  type: DayType;
  startsOn: string | null;
  endsOn: string | null;
  halfKind: HalfKind;
  cutoff: string;
  followsWeekday: number;
  label: string;
};

export const newDayForm = (): DayForm => ({
  type: 'holiday',
  startsOn: null,
  endsOn: null,
  halfKind: 'no_classes_after',
  cutoff: '',
  followsWeekday: 1,
  label: '',
});

export const dayFormFrom = (day: CalendarDay): DayForm => ({
  type: day.kind === 'holiday' ? 'holiday' : day.kind === 'follows_weekday' ? 'follows' : 'half',
  startsOn: day.startsOn,
  endsOn: day.kind === 'holiday' && day.endsOn !== day.startsOn ? day.endsOn : null,
  halfKind: day.kind === 'no_classes_before' ? 'no_classes_before' : 'no_classes_after',
  cutoff: day.cutoff ? showTime(clockToMinutes(day.cutoff)) : '',
  followsWeekday: day.followsWeekday ?? 1,
  label: day.label ?? '',
});

const outsideMessage = (timetable: Pick<Timetable, 'startsOn' | 'endsOn'>) =>
  timetable.endsOn ? `Must be between ${formatDate(timetable.startsOn)} and ${formatDate(timetable.endsOn)}` : `Must be on or after ${formatDate(timetable.startsOn)}`;

export const checkDayForm = (form: DayForm, timetable: Pick<Timetable, 'startsOn' | 'endsOn'>): { input: CalendarDayInput | null; errors: FieldErrors } => {
  const errors: FieldErrors = {};
  const label = form.label.trim();
  const inside = (date: string) => date >= timetable.startsOn && (timetable.endsOn === null || date <= timetable.endsOn);
  if (!form.startsOn) errors.startsOn = 'Choose the date';
  else if (!inside(form.startsOn)) errors.startsOn = outsideMessage(timetable);
  const endsOn = form.type === 'holiday' && form.endsOn ? form.endsOn : form.startsOn;
  if (form.type === 'holiday' && form.endsOn && form.startsOn) {
    if (form.endsOn < form.startsOn) errors.endsOn = 'Must be on or after the first day';
    else if (!inside(form.endsOn)) errors.endsOn = outsideMessage(timetable);
  }
  let cutoff: string | null = null;
  if (form.type === 'half') {
    const minutes = parseTime(form.cutoff);
    if (minutes === null) errors.cutoff = form.cutoff.trim() ? 'Enter a time like 12:00 or 1:40 pm' : 'Enter the time';
    else cutoff = minutesToClock(minutes);
  }
  if (label.length > 80) errors.label = 'At most 80 characters';
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      kind: form.type === 'holiday' ? 'holiday' : form.type === 'follows' ? 'follows_weekday' : form.halfKind,
      startsOn: form.startsOn!,
      endsOn: endsOn!,
      followsWeekday: form.type === 'follows' ? form.followsWeekday : null,
      cutoff,
      label: label || null,
    },
    errors,
  };
};

export const byDate = (days: CalendarDay[]) => [...days].sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : a.id - b.id));
