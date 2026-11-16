import { createContext, use } from 'react';
import { StyleSheet } from 'react-native';
import { themes } from '../lib/palette.ts';
import type { Theme } from '../lib/palette.ts';

export { themes } from '../lib/palette.ts';
export type { Colors, Scheme, Theme, Tones } from '../lib/palette.ts';

export const ThemeContext = createContext<Theme>(themes.light);

export const useTheme = () => use(ThemeContext);

type Styles = Parameters<typeof StyleSheet.create>[0];

export const makeStyles = <S extends Styles>(build: (theme: Theme) => S & Styles) => {
  const made = new Map<Theme, Readonly<S>>();
  return () => {
    const theme = useTheme();
    const known = made.get(theme);
    if (known) return known;
    const styles = StyleSheet.create(build(theme));
    made.set(theme, styles);
    return styles;
  };
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
