import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './Button.tsx';
import { ErrorNotice } from './Notice.tsx';
import { colors, space } from './theme.ts';

type Props = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export const Page = ({ children, refreshing, onRefresh }: Props) => (
  <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
);

export const Loading = () => (
  <View style={styles.center}>
    <ActivityIndicator color={colors.primary} />
  </View>
);

export const LoadFailed = ({ message, onRetry, busy }: { message: string | null; onRetry: () => void; busy: boolean }) => (
  <View style={styles.failed}>
    <ErrorNotice message={message ?? 'Could not load this.'} />
    <Button title="Try again" onPress={onRetry} busy={busy} />
  </View>
);

export const SectionTitle = ({ children, first = false }: { children: string; first?: boolean }) => (
  <Text style={[styles.section, first ? null : styles.sectionGap]} role="heading">
    {children}
  </Text>
);

export const Muted = ({ children }: { children: ReactNode }) => <Text style={styles.muted}>{children}</Text>;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  body: { padding: space.xl, paddingBottom: space.xxl * 2, width: '100%', maxWidth: 640, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  failed: { flex: 1, padding: space.xl, backgroundColor: colors.background },
  section: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: space.md },
  sectionGap: { marginTop: space.xl },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: space.md },
});
