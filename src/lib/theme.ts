export type Palette = {
  dark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  /** Home hero card: background and text, at least 4.5:1 contrast. */
  hero: string;
  onHero: string;
  expense: string;
  income: string;
  warning: string;
  danger: string;
};

export const light: Palette = {
  dark: false,
  bg: '#F4F6F5',
  card: '#FFFFFF',
  cardAlt: '#EEF2F0',
  text: '#0F1A15',
  textMuted: '#6B7A73',
  border: '#E2E8E5',
  primary: '#0E9F6E',
  primarySoft: '#D7F5EA',
  onPrimary: '#FFFFFF',
  hero: '#047857',
  onHero: '#FFFFFF',
  expense: '#E5484D',
  income: '#0E9F6E',
  warning: '#F5A524',
  danger: '#E5484D',
};

export const dark: Palette = {
  dark: true,
  bg: '#0B0F0D',
  card: '#151B18',
  cardAlt: '#1E2622',
  text: '#F1F5F3',
  textMuted: '#8A9A93',
  border: '#26302B',
  primary: '#2BD59A',
  primarySoft: '#123A2C',
  onPrimary: '#04140D',
  hero: '#2BD59A',
  onHero: '#04140D',
  expense: '#FF6B6B',
  income: '#2BD59A',
  warning: '#FFB547',
  danger: '#FF6B6B',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = (n: number) => n * 4;
