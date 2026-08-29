import { colorTokens, fontSizeTokens, spaceTokens } from '@moja-kuchnia/design-tokens';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';

import { touchMin, ui } from '@/theme/ui';

export function LoadingState({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colorTokens.accent} size="large" />
      <Text style={ui.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={ui.empty} accessibilityRole="summary">
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={ui.muted}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={ui.empty} accessibilityRole="alert">
      <Text style={ui.dangerText}>{message}</Text>
      {onRetry ? (
        <PrimaryButton label="Spróbuj ponownie" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  loading,
  secondary,
  disabled,
  ...rest
}: {
  label: string;
  loading?: boolean;
  secondary?: boolean;
} & PressableProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      style={({ pressed }) => [
        ui.button,
        secondary ? ui.buttonSecondary : null,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colorTokens.foreground : '#fff'} />
      ) : (
        <Text
          style={[ui.buttonText, secondary ? ui.buttonTextSecondary : null]}
          maxFontSizeMultiplier={1.4}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spaceTokens.md,
    padding: spaceTokens.lg,
  },
  emptyTitle: {
    fontSize: fontSizeTokens.lg,
    fontWeight: '600',
    color: colorTokens.foreground,
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});

export { touchMin };
