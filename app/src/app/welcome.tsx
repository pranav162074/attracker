import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { colors, space, tones } from '../ui/theme.ts';

const Example = () => (
  <View style={styles.example} aria-label="Example of what attracker shows">
    <View style={styles.exampleTop}>
      <Text style={styles.exampleLabel}>Overall</Text>
      <Badge label="On track" tone="good" />
    </View>
    <Text style={styles.examplePercent}>78.40%</Text>
    <Text style={styles.exampleMuted}>196 of 250 attended · Missed 54 classes</Text>
    <Text style={styles.exampleLine}>You can miss 11 classes and stay at 75% or above.</Text>
    <View style={styles.exampleRows}>
      <View style={styles.exampleRow}>
        <Text style={styles.exampleSubject}>Computer Networks</Text>
        <Text style={[styles.exampleValue, { color: colors.text }]}>81.25%</Text>
      </View>
      <View style={styles.exampleRow}>
        <Text style={styles.exampleSubject}>Networks Lab</Text>
        <Text style={[styles.exampleValue, { color: colors.text }]}>88.88%</Text>
      </View>
      <View style={[styles.exampleRow, styles.exampleLast]}>
        <Text style={styles.exampleSubject}>Data Mining</Text>
        <Text style={[styles.exampleValue, { color: tones.bad.text }]}>69.04%</Text>
      </View>
    </View>
  </View>
);

export default function Welcome() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.top}>
            <Text style={styles.brand}>attracker</Text>
            <Link href="/login" style={styles.topLink}>
              Log in
            </Link>
          </View>

          <Text style={styles.title} role="heading">
            Know where your attendance stands
          </Text>
          <Text style={styles.lead}>attracker counts your classes against your college’s attendance rule, so you always know how many you can miss.</Text>
          <View style={styles.actions}>
            <Button title="Create an account" onPress={() => router.push('/signup')} />
            <Button title="Log in" variant="secondary" onPress={() => router.push('/login')} />
          </View>

          <Example />

          <Link href="/features" style={styles.more}>
            See everything attracker does →
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xxl },
  brand: { fontSize: 17, fontWeight: '700', color: colors.primary },
  topLink: { fontSize: 15, fontWeight: '600', color: colors.primary },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, lineHeight: 34, marginBottom: space.md },
  lead: { fontSize: 16, color: colors.muted, lineHeight: 24, marginBottom: space.xl },
  actions: { gap: space.md, marginBottom: space.xxl },
  example: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg },
  exampleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exampleLabel: { fontSize: 15, fontWeight: '600', color: colors.muted },
  examplePercent: { fontSize: 36, fontWeight: '700', color: colors.text, marginTop: space.sm },
  exampleMuted: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  exampleLine: { fontSize: 15, color: colors.text, marginTop: space.md },
  exampleRows: { marginTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border },
  exampleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  exampleLast: { borderBottomWidth: 0, paddingBottom: 0 },
  exampleSubject: { fontSize: 15, color: colors.text },
  exampleValue: { fontSize: 15, fontWeight: '600' },
  more: { alignSelf: 'center', marginTop: space.xl, fontSize: 15, fontWeight: '600', color: colors.primary },
});
