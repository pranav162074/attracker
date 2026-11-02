export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad = (value: number) => String(value).padStart(2, '0');

export const toIso = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

export const parseIso = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year!, month: month! - 1, day: day! };
};

export const isRealIso = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseIso(value);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
};

export const formatDate = (iso: string) => {
  const { year, month, day } = parseIso(iso);
  return `${day} ${MONTHS[month]!.slice(0, 3)} ${year}`;
};

export const shiftMonth = (year: number, month: number, by: number) => {
  const total = year * 12 + month + by;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
};

export type DayCell = { iso: string; day: number; inMonth: boolean };

export const monthGrid = (year: number, month: number): DayCell[][] => {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = Date.UTC(year, month, 1 - offset);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const grid: DayCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const row: DayCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(start + (week * 7 + weekday) * 86_400_000);
      row.push({
        iso: toIso(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month,
      });
    }
    grid.push(row);
  }
  return grid;
};

export const deviceTimeZone = () => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
};

export const friendlyDates = (text: string) => text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => (isRealIso(iso) ? formatDate(iso) : iso));
