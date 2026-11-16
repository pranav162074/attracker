import { describe, it, expect } from 'vitest';
import { appearanceLabel, readAppearance, schemeFor } from '../src/lib/appearance.ts';
import { themes } from '../src/lib/palette.ts';

describe('appearance', () => {
  it('follows the phone unless light or dark was chosen', () => {
    expect(schemeFor('system', 'dark')).toBe('dark');
    expect(schemeFor('system', 'light')).toBe('light');
    expect(schemeFor('system', null)).toBe('light');
    expect(schemeFor('light', 'dark')).toBe('light');
    expect(schemeFor('dark', 'light')).toBe('dark');
  });

  it('reads a saved choice and falls back to the phone', () => {
    expect(readAppearance('dark')).toBe('dark');
    expect(readAppearance('light')).toBe('light');
    expect(readAppearance('system')).toBe('system');
    expect(readAppearance(null)).toBe('system');
    expect(readAppearance('purple')).toBe('system');
  });

  it('names each choice', () => {
    expect(appearanceLabel('system')).toBe('Same as phone');
    expect(appearanceLabel('dark')).toBe('Dark');
  });

  it('has the same colours named in both themes, each set in dark', () => {
    expect(Object.keys(themes.dark.colors).sort()).toEqual(Object.keys(themes.light.colors).sort());
    expect(Object.keys(themes.dark.tones).sort()).toEqual(Object.keys(themes.light.tones).sort());
    expect(themes.dark.colors.background).not.toBe(themes.light.colors.background);
    expect(themes.dark.colors.text).not.toBe(themes.light.colors.text);
  });
});
