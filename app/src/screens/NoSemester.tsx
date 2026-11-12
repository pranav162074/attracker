import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { OverviewItem } from '../lib/api.ts';
import { Button } from '../ui/Button.tsx';
import { colors, space } from '../ui/theme.ts';

export const NoSemester = () => {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Set up your first semester</Text>
      <Text style={styles.body}>Add your subjects and weekly timetable once. After that, every class counts as attended and you only mark the ones you miss.</Text>
      <Button title="Set up a semester" onPress={() => router.push('/timetables/new')} />
      <Button title="Copy a classmate’s timetable" variant="secondary" onPress={() => router.push('/timetables/copy')} />
    </View>
  );
};

export const FinishSetup = ({ semester, onContinue }: { semester: OverviewItem; onContinue: () => void }) => (
  <View style={styles.card}>
    <Text style={styles.title}>Finish setting up {semester.name}</Text>
    <Text style={styles.body}>Attendance starts counting once the subjects and weekly timetable are in and you press Start tracking.</Text>
    <Button title="Continue setup" onPress={onContinue} />
  </View>
);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, gap: space.md },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.muted, lineHeight: 22 },
});
