import type { SharedPreview } from './api.ts';
import { formatDate } from './dates.ts';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const cleanCode = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const checkCode = (text: string) => {
  const code = cleanCode(text);
  if (!code) return { code: null, error: 'Enter the code your classmate shared' };
  if (code.length !== 8 || ![...code].every((letter) => LETTERS.includes(letter))) return { code: null, error: 'A code is 8 letters and numbers, like 7K3P-Q9M2' };
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, error: null };
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const previewLines = (preview: SharedPreview) => {
  const counted = preview.subjects.filter((subject) => subject.countsAttendance).length;
  const others = preview.subjects.length - counted;
  const dates = preview.endsOn ? `${formatDate(preview.startsOn)} to ${formatDate(preview.endsOn)}` : `From ${formatDate(preview.startsOn)}`;
  const rule =
    preview.requiredPercent === null ? 'No minimum attendance' : `${preview.requiredPercent}% required${preview.condonationPercent === null ? '' : `, condonation from ${preview.condonationPercent}%`}`;
  return [
    dates,
    rule,
    `${plural(counted, 'subject', 'subjects')} counted${others > 0 ? `, ${others} not counted` : ''}`,
    `${plural(preview.classesPerWeek, 'class', 'classes')} a week`,
    preview.specialDays === 0 ? 'No holidays added' : `${plural(preview.specialDays, 'holiday or special day', 'holidays and special days')}`,
  ];
};

export const shareMessage = (code: string, name: string) =>
  `Copy my ${name} timetable on attracker: when you set up a new semester, choose "Copy a classmate’s timetable" and enter the code ${code}`;
