/**
 * URU design tokens — single source of truth.
 * Web apps mirror these in their Tailwind `@theme` block (src/index.css); the mobile app imports them directly.
 */
export const colors = {
  forest: '#174D38',
  forestDark: '#0F3526',
  forestDeep: '#0A2A1D',
  forestSoft: '#2C6B52',
  forestTint: '#E7EFEA',
  terracotta: '#D97745',
  terracottaDark: '#B85E2F',
  terracottaTint: '#FBEDE4',
  cream: '#FAF7F0',
  creamDark: '#F1EBDD',
  white: '#FFFFFF',
  ink: '#1D2722',
  inkSoft: '#4A5650',
  muted: '#7A847F',
  line: '#E6E0D2',
  success: '#2E7D4F',
  successTint: '#E3F2E8',
  warning: '#B7791F',
  warningTint: '#FCF3DC',
  danger: '#B83A2E',
  dangerTint: '#FBE7E4',
  info: '#2F6690',
  infoTint: '#E4EEF6',
} as const;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
} as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 } as const;

export const shadows = {
  card: '0 1px 2px rgba(29, 39, 34, 0.04), 0 4px 16px rgba(29, 39, 34, 0.06)',
  raised: '0 8px 30px rgba(15, 53, 38, 0.12)',
} as const;

export const brand = {
  name: 'URU',
  tagline: 'Your Village. Your City. Your URU.',
} as const;
