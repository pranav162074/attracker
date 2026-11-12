import type { DraftSlot } from './grid.ts';

const SMALL_WORDS = new Set(['and', 'of', 'the', 'to', 'in', 'for', '&']);

export const abbreviate = (name: string, shortName: string | null = null) => {
  if (shortName && shortName.trim()) return shortName.trim();
  const trimmed = name.trim();
  if (trimmed.length <= 8) return trimmed;
  const letters = trimmed
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word && !SMALL_WORDS.has(word.toLowerCase()))
    .map((word) => word[0]!.toUpperCase())
    .join('');
  return letters.length >= 2 ? letters.slice(0, 6) : trimmed.slice(0, 7);
};

export const weekRows = (draft: Pick<DraftSlot, 'weekday' | 'start'>[], days: number[]) =>
  [...new Set(draft.filter((slot) => days.includes(slot.weekday)).map((slot) => slot.start))].sort((a, b) => a - b);

export const slotAt = <T extends Pick<DraftSlot, 'weekday' | 'start'>>(draft: T[], weekday: number, start: number) => draft.find((slot) => slot.weekday === weekday && slot.start === start) ?? null;
