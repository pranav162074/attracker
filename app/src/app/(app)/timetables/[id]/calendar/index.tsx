import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { api } from '../../../../../session.tsx';
import { byDate, describeDay } from '../../../../../lib/calendar.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { ListBox, ListRow } from '../../../../../ui/Controls.tsx';
import { LoadFailed, Loading, Muted, Page } from '../../../../../ui/Page.tsx';
import { space } from '../../../../../ui/theme.ts';
import { SetupFooter, SetupIntro, SetupProgress } from '../../../../../screens/SetupFrame.tsx';
import { isSetup } from '../../../../../setupFlow.ts';

export default function Calendar() {
  const router = useRouter();
  const { id, setup } = useLocalSearchParams<{ id: string; setup?: string }>();
  const inSetup = isSetup(setup);
  const timetableId = Number(id);
  const load = useCallback(() => api.calendar(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const days = byDate(data);
  const base = `/timetables/${timetableId}/calendar` as const;

  return (
    <Page refreshing={refreshing} onRefresh={refresh}>
      {inSetup ? <SetupProgress route="calendar" /> : null}
      {inSetup ? <SetupIntro title="Holidays (optional)">Days with no classes, so they are not counted. You can add more at any time.</SetupIntro> : null}
      <Muted>Add every day the weekly timetable does not apply: holidays, exam weeks and breaks, half days, and Saturdays that follow another day’s timetable. Days you leave out count as normal days.</Muted>
      <View style={styles.actions}>
        <Button title="Paste from the academic calendar" onPress={() => router.push(`${base}/import`)} />
        <Button title="Add a day" variant="secondary" onPress={() => router.push(`${base}/new`)} />
      </View>
      {days.length === 0 ? (
        <Muted>Nothing added yet.</Muted>
      ) : (
        <ListBox>
          {days.map((day) => {
            const { title, detail } = describeDay(day);
            return <ListRow key={day.id} title={title} detail={detail} onPress={() => router.push(`${base}/${day.id}`)} />;
          })}
        </ListBox>
      )}
      {inSetup ? <SetupFooter timetableId={timetableId} route="calendar" nextLabel={days.length === 0 ? 'Skip for now' : 'Next'} /> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md, marginBottom: space.xl },
});
