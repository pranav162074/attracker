import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { colors, space, tones } from '../ui/theme.ts';

const STEPS = [
  { title: 'Add your timetable', body: 'Your subjects, the weekly timetable and holidays. Takes about ten minutes, once a semester.' },
  { title: 'Mark only what changes', body: 'Every class counts as attended. Mark the ones you miss, the ones that get cancelled, and swaps.' },
  { title: 'Know where you stand', body: 'Your overall and per-subject percentage, how many classes you can still miss, and how many you need to attend.' },
];

const DETAILS = [
  { title: 'Counts like your college', body: 'Labs count by periods, percentages are cut at two decimals like the official sheet, and the condonation band (65% to 75%) is shown separately.' },
  { title: 'Start any time in the semester', body: 'Enter the attendance the college last gave you, per subject or just the overall percentage, and carry on from there.' },
  { title: 'Holidays and odd days', body: 'Holidays, half days, a Saturday that runs Monday’s timetable, and extra classes are all handled.' },
  { title: 'Works without internet', body: 'The app shows what it last loaded and saves your marks until you are back online. The Android app can remind you each evening.' },
];

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
          <Text style={styles.lead}>attracker keeps count of your classes against your college’s attendance rule, so you know how many you can miss before it becomes a problem.</Text>
          <View style={styles.actions}>
            <Button title="Create an account" onPress={() => router.push('/signup')} />
            <Button title="Log in" variant="secondary" onPress={() => router.push('/login')} />
          </View>

          <Example />

          <Text style={styles.section} role="heading">
            How it works
          </Text>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <View style={styles.stepText}>
                <Text style={styles.itemTitle}>{step.title}</Text>
                <Text style={styles.itemBody}>{step.body}</Text>
              </View>
            </View>
          ))}

          <Text style={styles.section} role="heading">
            Made for how colleges count
          </Text>
          {DETAILS.map((detail) => (
            <View key={detail.title} style={styles.detail}>
              <Text style={styles.itemTitle}>{detail.title}</Text>
              <Text style={styles.itemBody}>{detail.body}</Text>
            </View>
          ))}

          <View style={styles.end}>
            <Text style={styles.endText}>Free to use. Your attendance is visible only to you.</Text>
            <Button title="Create an account" onPress={() => router.push('/signup')} />
          </View>
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
  section: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: space.xxl, marginBottom: space.lg },
  step: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  stepNumber: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, textAlign: 'center', lineHeight: 26, fontSize: 14, color: colors.muted },
  stepText: { flex: 1 },
  detail: { marginBottom: space.lg },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
  itemBody: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  end: { marginTop: space.xl, paddingTop: space.xl, borderTopWidth: 1, borderTopColor: colors.border, gap: space.md },
  endText: { fontSize: 15, color: colors.muted },
});
