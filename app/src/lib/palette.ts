export type Scheme = 'light' | 'dark';

const lightColors = {
  text: '#1b1b1b',
  muted: '#5f6368',
  border: '#c4c7c5',
  background: '#ffffff',
  surface: '#f4f5f6',
  primary: '#1d5bb8',
  primaryPressed: '#174a96',
  onPrimary: '#ffffff',
  onTone: '#ffffff',
  disabled: '#9aa4b2',
  error: '#b3261e',
  errorBackground: '#fdecea',
  danger: '#b3261e',
  dangerPressed: '#8c1d18',
  infoBackground: '#e8f0fb',
  backdrop: 'rgba(0,0,0,0.35)',
};

export type Colors = typeof lightColors;

const darkColors: Colors = {
  text: '#e3e3e3',
  muted: '#a8acb0',
  border: '#4a4f54',
  background: '#121314',
  surface: '#1e2023',
  primary: '#4a80d6',
  primaryPressed: '#3a6bbb',
  onPrimary: '#ffffff',
  onTone: '#121314',
  disabled: '#4f5862',
  error: '#f28b82',
  errorBackground: '#3b1f1d',
  danger: '#c5342b',
  dangerPressed: '#a32a22',
  infoBackground: '#1b2a40',
  backdrop: 'rgba(0,0,0,0.6)',
};

const lightTones = {
  good: { text: '#1b6b2f', background: '#e5f3e8' },
  warn: { text: '#8a4b00', background: '#fdf0dc' },
  bad: { text: '#b3261e', background: '#fdecea' },
  neutral: { text: '#5f6368', background: '#f1f3f4' },
};

export type Tones = typeof lightTones;

const darkTones: Tones = {
  good: { text: '#81c995', background: '#1d3325' },
  warn: { text: '#f6c26b', background: '#3a2d12' },
  bad: { text: '#f28b82', background: '#3b1f1d' },
  neutral: { text: '#bdc1c6', background: '#2a2d30' },
};

export type Theme = { scheme: Scheme; colors: Colors; tones: Tones };

export const themes: Record<Scheme, Theme> = {
  light: { scheme: 'light', colors: lightColors, tones: lightTones },
  dark: { scheme: 'dark', colors: darkColors, tones: darkTones },
};
