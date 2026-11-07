import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../ui/Button.tsx';
import { colors, space } from '../ui/theme.ts';

const FEATURES = [
  { title: 'One tap a day', body: 'Every class counts as attended. Tap Absent only when you miss one, or Cancelled when it does not happen.' },
  { title: 'Counts like your college', body: 'Labs count by periods, percentages are cut at two decimals like the official sheet, and the condonation band (like 65% to 75%) is shown separately.' },
  { title: 'Start any time', body: 'Joined partway through the semester? Enter the attendance the college gave you: from the sheet, per subject, or just the overall percentage.' },
  { title: 'What you can still miss', body: 'For the semester and every subject: how many classes you can skip, or how many you need to attend to get back to the minimum.' },
  { title: 'Holidays and odd days', body: 'Holidays, half days, a Saturday that follows Monday’s timetable, extra classes, and one subject taking another’s class.' },
  { title: 'Works offline, reminds you', body: 'Mark without internet and it saves when you are back online. The Android app can remind you each evening on days with classes.' },
];

export default function Features() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.top}>
            <Link href="/welcome" style={styles.brand}>
              attracker
            </Link>
            <Link href="/login" style={styles.topLink}>
              Log in
            </Link>
          </View>
          <Text style={styles.title} role="heading">
            What attracker does
          </Text>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureBody}>{feature.body}</Text>
            </View>
          ))}
          <Text style={styles.free}>Free to use. Your attendance is visible only to you.</Text>
          <Button title="Create an account" onPress={() => router.push('/signup')} />
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
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: space.md },
  feature: { paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.surface },
  featureTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  featureBody: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  free: { fontSize: 15, color: colors.muted, marginTop: space.xl, marginBottom: space.md },
});
