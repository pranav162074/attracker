import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from './theme.ts';

type Props = PropsWithChildren<{ title: string; subtitle?: string }>;

export const FormScreen = ({ title, subtitle, children }: Props) => (
  <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={styles.brand}>attracker</Text>
          <Text style={styles.title} role="heading">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.xl },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  brand: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: space.xl },
  title: { fontSize: 24, fontWeight: '600', color: colors.text, marginBottom: space.sm },
  subtitle: { fontSize: 15, color: colors.muted, marginBottom: space.xl },
});
