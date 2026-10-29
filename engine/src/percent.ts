export type Hundredths = number;

const assertCount = (name: string, value: number) => {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number of 0 or more`);
};

export const percentHundredths = (attended: number, held: number): Hundredths | null => {
  assertCount('attended', attended);
  assertCount('held', held);
  if (attended > held) throw new RangeError('attended cannot be more than held');
  if (held === 0) return null;
  return Math.floor((attended * 10_000) / held);
};

export const formatPercent = (value: Hundredths | null): string => {
  if (value === null) return '-';
  const whole = Math.floor(value / 100);
  const fraction = value % 100;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
};
