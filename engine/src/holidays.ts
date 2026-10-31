import { isRealDate, isoWeekday, WEEKDAY_NAMES } from './dates.ts';

export type ParsedHoliday = {
  startsOn: string;
  endsOn: string;
  label: string | null;
  source: string;
  warnings: string[];
};

export type HolidayParse = {
  holidays: ParsedHoliday[];
  skipped: Array<{ line: number; text: string; reason: string }>;
};

const DATE = String.raw`(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})`;
const RANGE = new RegExp(String.raw`(?:${DATE})(?:\s*(?:-|–|—|to|till|until)\s*(?:${DATE}))?`, 'gi');
const WEEKDAY_IN_TEXT = /\(?\b(mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b\.?\)?/gi;

const pad = (value: string) => value.padStart(2, '0');

const toIso = (parts: Array<string | undefined>, offset: number) => {
  const [isoYear, isoMonth, isoDay, day, month, year] = parts.slice(offset, offset + 6);
  if (isoYear) return `${isoYear}-${pad(isoMonth!)}-${pad(isoDay!)}`;
  if (!day) return null;
  const fullYear = year!.length === 2 ? `20${year}` : year!;
  return `${fullYear}-${pad(month!)}-${pad(day)}`;
};

const WEEKDAY_PREFIX: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

const cleanLabel = (text: string) =>
  text
    .replace(WEEKDAY_IN_TEXT, ' ')
    .replace(/^[\s:,.;–—-]+|[\s:,.;–—-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 80) || null;

export const parseHolidays = (text: string): HolidayParse => {
  const holidays: ParsedHoliday[] = [];
  const skipped: HolidayParse['skipped'] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const matches = [...line.matchAll(RANGE)];
    if (matches.length === 0) {
      skipped.push({ line: index + 1, text: line, reason: 'No date found' });
      return;
    }

    matches.forEach((match, position) => {
      const segmentEnd = matches[position + 1]?.index ?? line.length;
      const after = line.slice(match.index + match[0].length, segmentEnd);
      const source = line.slice(match.index, segmentEnd).trim();
      const startsOn = toIso(match, 1);
      const endsOn = match[7] || match[10] ? toIso(match, 7) : startsOn;
      if (!startsOn || !endsOn || !isRealDate(startsOn) || !isRealDate(endsOn)) {
        skipped.push({ line: index + 1, text: source, reason: 'Not a real date' });
        return;
      }
      if (endsOn < startsOn) {
        skipped.push({ line: index + 1, text: source, reason: 'The range ends before it starts' });
        return;
      }

      const warnings: string[] = [];
      const named = [...after.slice(0, 20).matchAll(WEEKDAY_IN_TEXT)][0];
      if (named && startsOn === endsOn) {
        const expected = WEEKDAY_PREFIX[named[1]!.slice(0, 3).toLowerCase()];
        const actual = isoWeekday(startsOn);
        if (expected && expected !== actual) {
          warnings.push(`${startsOn} is a ${WEEKDAY_NAMES[actual - 1]}, but the text says ${WEEKDAY_NAMES[expected - 1]}`);
        }
      }
      const before = position === 0 ? line.slice(0, match.index) : '';
      holidays.push({ startsOn, endsOn, label: cleanLabel(after) ?? cleanLabel(before), source: position === 0 ? line.slice(0, segmentEnd).trim() : source, warnings });
    });
  });

  holidays.sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
  return { holidays, skipped };
};
