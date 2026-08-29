import { colorTokens, fontSizeTokens, spaceTokens } from '@moja-kuchnia/design-tokens';
import { StyleSheet } from 'react-native';

export const touchMin = 44;

export const ui = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colorTokens.background,
  },
  padded: {
    paddingHorizontal: spaceTokens.lg,
    paddingVertical: spaceTokens.md,
    gap: spaceTokens.md,
  },
  title: {
    fontSize: fontSizeTokens.xl,
    fontWeight: '700',
    color: colorTokens.foreground,
  },
  subtitle: {
    fontSize: fontSizeTokens.md,
    color: colorTokens.muted,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colorTokens.surface,
    borderColor: colorTokens.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spaceTokens.md,
    gap: spaceTokens.sm,
  },
  label: {
    fontSize: fontSizeTokens.sm,
    fontWeight: '600',
    color: colorTokens.foreground,
  },
  input: {
    minHeight: touchMin,
    borderWidth: 1,
    borderColor: colorTokens.border,
    borderRadius: 12,
    paddingHorizontal: spaceTokens.md,
    paddingVertical: spaceTokens.sm,
    fontSize: fontSizeTokens.md,
    color: colorTokens.foreground,
    backgroundColor: colorTokens.surface,
  },
  button: {
    minHeight: touchMin,
    borderRadius: 12,
    paddingHorizontal: spaceTokens.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorTokens.accent,
  },
  buttonSecondary: {
    backgroundColor: colorTokens.surface,
    borderWidth: 1,
    borderColor: colorTokens.border,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSizeTokens.md,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: colorTokens.foreground,
  },
  dangerText: {
    color: colorTokens.danger,
    fontSize: fontSizeTokens.sm,
  },
  muted: {
    color: colorTokens.muted,
    fontSize: fontSizeTokens.sm,
  },
  empty: {
    padding: spaceTokens.xl,
    alignItems: 'center',
    gap: spaceTokens.sm,
  },
});
