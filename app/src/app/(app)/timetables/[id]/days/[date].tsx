import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { isRealIso } from '../../../../../lib/dates.ts';
import { dayTitle, shiftDay } from '../../../../../lib/day.ts';
import { localDate } from '../../../../../lib/format.ts';
import { DayClasses } from '../../../../../screens/DayClasses.tsx';
import { Button } from '../../../../../ui/Button.tsx';
import { Page } from '../../../../../ui/Page.tsx';
import { colors, space } from '../../../../../ui/theme.ts';

export default function DayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; date: string }>();
  const timetableId = Number(params.id);
  const today = localDate();
  const date = params.date && isRealIso(params.date) ? params.date : today;
  const go = (next: string) => router.setParams({ date: next });

  return (
    <Page>
      <Stack.Screen options={{ title: dayTitle(date, today) }} />
      <View style={styles.nav}>
        <Pressable role="button" aria-label="Previous day" onPress={() => go(shiftDay(date, -1))} style={styles.navButton}>
          <Text style={styles.link}>‹ Previous day</Text>
        </Pressable>
        {date !== today ? (
          <Pressable role="button" onPress={() => go(today)} style={styles.navButton}>
            <Text style={styles.link}>Today</Text>
          </Pressable>
        ) : null}
        <Pressable role="button" aria-label="Next day" onPress={() => go(shiftDay(date, 1))} style={styles.navButton}>
          <Text style={styles.link}>Next day ›</Text>
        </Pressable>
      </View>
      <DayClasses key={date} timetableId={timetableId} date={date} />
      <View style={styles.holiday}>
        <Button title="Mark this whole day as a holiday" variant="secondary" onPress={() => router.push(`/timetables/${timetableId}/calendar/new?date=${date}`)} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  navButton: { paddingVertical: space.sm },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  holiday: { marginTop: space.xl },
});
