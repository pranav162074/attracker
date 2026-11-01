import type { Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputInstance, TextInputProps } from 'react-native';
import { colors, space } from './theme.ts';

type Props = TextInputProps & { label: string; error?: string | undefined; ref?: Ref<TextInputInstance> };

export const TextField = ({ label, error, style, ref, ...input }: Props) => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      ref={ref}
      style={[styles.input, error ? styles.inputError : null, style]}
      placeholderTextColor={colors.muted}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      {...input}
    />
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { fontSize: 14, color: colors.text, marginBottom: space.xs, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.error },
  error: { color: colors.error, fontSize: 13, marginTop: space.xs },
});
