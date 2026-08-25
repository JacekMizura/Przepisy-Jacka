export const colorTokens = {
  background: "#f7f3ee",
  foreground: "#1c1917",
  muted: "#78716c",
  accent: "#b45309",
  success: "#166534",
  danger: "#b91c1c",
  border: "#e7e5e4",
  surface: "#ffffff",
} as const;

export const spaceTokens = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const fontSizeTokens = {
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

export type ColorToken = keyof typeof colorTokens;
export type SpaceToken = keyof typeof spaceTokens;
export type FontSizeToken = keyof typeof fontSizeTokens;
