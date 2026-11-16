import { ActivityIndicator, Pressable, Text } from 'react-native';
import { makeStyles, space, useTheme } from './theme.ts';

type Props = {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export const Button = ({ title, onPress, busy = false, disabled = false, variant = 'primary' }: Props) => {
  const { colors } = useTheme();
  const styles = useStyles();
  const inactive = busy || disabled;
  const primary = variant !== 'secondary';
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
        variant === 'danger' ? styles.danger : null,
        pressed && variant === 'primary' ? styles.primaryPressed : null,
        pressed && variant === 'danger' ? styles.dangerPressed : null,
        pressed && !primary ? styles.secondaryPressed : null,
        inactive && primary ? styles.primaryDisabled : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.text, primary ? styles.primaryText : styles.secondaryText]}>{title}</Text>
      )}
    </Pressable>
  );
};

const useStyles = makeStyles(({ colors }) => ({
  base: { minHeight: 48, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  primaryDisabled: { backgroundColor: colors.disabled },
  danger: { backgroundColor: colors.danger },
  dangerPressed: { backgroundColor: colors.dangerPressed },
  secondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  secondaryPressed: { backgroundColor: colors.surface },
  text: { fontSize: 16, fontWeight: '600' },
  primaryText: { color: colors.onPrimary },
  secondaryText: { color: colors.text },
}));
