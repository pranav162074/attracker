import type { Scheme } from './palette.ts';

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'Same as phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const readAppearance = (value: string | null | undefined): Appearance => (value === 'light' || value === 'dark' ? value : 'system');

export const schemeFor = (appearance: Appearance, phone: string | null | undefined): Scheme => {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return phone === 'dark' ? 'dark' : 'light';
};

export const appearanceLabel = (appearance: Appearance) => APPEARANCES.find((item) => item.value === appearance)!.label;
