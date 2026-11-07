import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, useSession } from '../../../session.tsx';
import { chooseSemester, loadSemesters } from '../../../currentSemester.ts';
import { loadReminderSettings } from '../../../reminderSync.ts';
import { notificationsSupported } from '../../../notifications';
import { friendlyDates } from '../../../lib/dates.ts';
import { problemFrom } from '../../../lib/forms.ts';
import { reminderSummary } from '../../../lib/reminders.ts';
import { datesDetail } from '../../../lib/semester.ts';
import { useLoad } from '../../../useLoad.ts';
import { SemesterHeader } from '../../../screens/SemesterHeader.tsx';
import { ConfirmButton } from '../../../ui/ConfirmButton.tsx';
import { ListBox, ListRow } from '../../../ui/Controls.tsx';
import { ErrorNotice } from '../../../ui/Notice.tsx';
import { LoadFailed, Loading, TabPage } from '../../../ui/Page.tsx';
import { colors, space } from '../../../ui/theme.ts';

const loadSettings = async () => {
  const [{ list, currentId }, reminders] = await Promise.all([loadSemesters(), loadReminderSettings()]);
  const current = list.find((item) => item.timetableId === currentId) ?? null;
  if (!current) return { list, currentId, current, timetable: null, setup: null, reminders };
  const [timetable, setup] = await Promise.all([api.timetable(current.timetableId), api.setup(current.timetableId)]);
  return { list, currentId, current, timetable, setup, reminders };
};

const Group = ({ title }: { title: string }) => <Text style={styles.group}>{title}</Text>;

export default function SettingsTab() {
  const router = useRouter();
  const { state } = useSession();
  const load = useCallback(() => loadSettings(), []);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  const { list, currentId, current, timetable, setup, reminders } = data;
  const email = state.status === 'signedIn' ? state.user.email : '';
  const step = (key: 'subjects' | 'grid' | 'holidays' | 'official') => friendlyDates(setup?.steps.find((item) => item.key === key)?.message ?? '');

  const remove = async () => {
    if (!current) return;
    setMessage(null);
    try {
      await api.deleteTimetable(current.timetableId);
      const next = list.find((item) => item.timetableId !== current.timetableId);
      if (next) await chooseSemester(next.timetableId);
      refresh();
    } catch (failure) {
      setMessage(problemFrom(failure).message);
    }
  };

  return (
    <TabPage refreshing={refreshing} onRefresh={refresh}>
      <SemesterHeader title="Settings" list={list} currentId={currentId} onChanged={refresh} />
      <ErrorNotice message={message} />
      {current && timetable ? (
        <>
          <Group title={current.name} />
          <ListBox>
            <ListRow title="Semester" detail={datesDetail(timetable)} onPress={() => router.push(`/timetables/${timetable.id}/details`)} />
            <ListRow title="Subjects" detail={step('subjects')} onPress={() => router.push(`/timetables/${timetable.id}/subjects`)} />
            <ListRow title="Weekly timetable" detail={step('grid')} onPress={() => router.push(`/timetables/${timetable.id}/grid`)} />
            <ListRow title="Holidays and special days" detail={step('holidays')} onPress={() => router.push(`/timetables/${timetable.id}/calendar`)} />
            <ListRow title="Attendance from college" detail={step('official')} onPress={() => router.push(`/timetables/${timetable.id}/official`)} />
          </ListBox>
        </>
      ) : null}

      <Group title="App" />
      <ListBox>
        <ListRow title="Reminders" detail={notificationsSupported ? reminderSummary(reminders, null) : 'Available in the Android app'} onPress={() => router.push('/reminders')} />
        <ListRow title="Account" detail={email} onPress={() => router.push('/account')} />
      </ListBox>

      <View style={styles.gap} />
      <ListBox>
        <ListRow title={current ? 'Add another semester' : 'Set up a semester'} onPress={() => router.push('/timetables/new')} />
      </ListBox>

      {current ? (
        <View style={styles.danger}>
          <ConfirmButton
            title={`Delete ${current.name}`}
            question={`Delete "${current.name}" with all its subjects, classes and attendance? This cannot be undone.`}
            confirmTitle="Delete"
            onConfirm={remove}
          />
        </View>
      ) : null}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  group: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', marginTop: space.md, marginBottom: space.sm },
  gap: { height: space.lg },
  danger: { marginTop: space.xl },
});
