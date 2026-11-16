import { createContext, use, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { readAppearance, schemeFor } from './lib/appearance.ts';
import type { Appearance } from './lib/appearance.ts';
import { prefs } from './prefs';
import { ThemeContext, themes } from './ui/theme.ts';

const KEY = 'appearance';

type Choice = { appearance: Appearance; setAppearance: (value: Appearance) => void };

const ChoiceContext = createContext<Choice>({ appearance: 'system', setAppearance: () => {} });

export const useAppearance = () => use(ChoiceContext);

export const ThemeChoiceProvider = ({ children }: { children: ReactNode }) => {
  const phone = useColorScheme();
  const [appearance, setChosen] = useState<Appearance>(() => readAppearance(prefs.readNow(KEY)));
  const theme = themes[schemeFor(appearance, phone)];

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.colors.background;
      document.documentElement.style.colorScheme = theme.scheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.background);
    }
  }, [theme]);

  const choice = useMemo<Choice>(
    () => ({
      appearance,
      setAppearance: (value) => {
        setChosen(value);
        prefs.save(KEY, value);
      },
    }),
    [appearance]
  );

  return (
    <ChoiceContext value={choice}>
      <ThemeContext value={theme}>{children}</ThemeContext>
    </ChoiceContext>
  );
};
