export const toMinutes = (clock: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/.exec(clock);
  if (!match) return null;
  if (clock === '24:00') return 1440;
  return Number(match[1]) * 60 + Number(match[2]);
};

export const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
