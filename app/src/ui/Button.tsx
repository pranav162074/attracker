import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, space } from './theme.ts';

type Props = {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

export const Button = ({ title, onPress, busy = false, disabled = false, variant = 'primary' }: Props) => {
  const inactive = busy || disabled;
  const primary = variant === 'primary';
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-disabled={inactive}
      aria-busy={busy}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && primary ? styles.primaryPressed : null,
        pressed && !primary ? styles.secondaryPressed : null,
        inactive && primary ? styles.primaryDisabled : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? '#ffffff' : colors.primary} />
      ) : (
        <Text style={[styles.text, primary ? styles.primaryText : styles.secondaryText]}>{title}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { minHeight: 48, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  primaryDisabled: { backgroundColor: colors.disabled },
  secondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  secondaryPressed: { backgroundColor: colors.surface },
  text: { fontSize: 16, fontWeight: '600' },
  primaryText: { color: '#ffffff' },
  secondaryText: { color: colors.text },
});
