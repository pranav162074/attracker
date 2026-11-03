import { useCallback, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../../../session.tsx';
import type { SetupStep, Timetable } from '../../../../lib/api.ts';
import { formatDate, friendlyDates } from '../../../../lib/dates.ts';
import { localDate } from '../../../../lib/format.ts';
import { problemFrom } from '../../../../lib/forms.ts';
import { STEP_TITLES } from '../../../../lib/setupForms.ts';
import { Dashboard } from '../../../../screens/Dashboard.tsx';
import { useLoad } from '../../../../useLoad.ts';
import { OfflineNotice } from '../../../../ui/OfflineNotice.tsx';
import { Button } from '../../../../ui/Button.tsx';
import { ListBox, ListRow } from '../../../../ui/Controls.tsx';
import { ErrorNotice } from '../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Muted, Page, SectionTitle } from '../../../../ui/Page.tsx';
import { colors, space, tones } from '../../../../ui/theme.ts';

const datesDetail = (timetable: Timetable) => {
  const range = timetable.endsOn ? `${formatDate(timetable.startsOn)} to ${formatDate(timetable.endsOn)}` : `From ${formatDate(timetable.startsOn)}, no end date`;
  if (timetable.requiredPercent === null) return `${range}. No minimum attendance.`;
  const condonation = timetable.condonationPercent === null ? '' : `, condonation from ${timetable.condonationPercent}%`;
  return `${range}. ${timetable.requiredPercent}% required${condonation}.`;
};

const Mark = ({ step, index }: { step: SetupStep; index: number }) => (
  <View style={[styles.mark, step.done ? styles.markDone : null]}>
    <Text style={[styles.markText, step.done ? styles.markTextDone : null]}>{step.done ? '✓' : String(index + 1)}</Text>
  </View>
);

const loadAll = async (id: number) => {
  const [timetable, setup] = await Promise.all([api.timetable(id), api.setup(id)]);
  const summary = setup.status === 'tracking' ? await api.summary(id) : null;
  return { timetable, setup, summary };
};

export default function TimetableScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => loadAll(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh, savedAt } = useLoad(load, `timetable.${timetableId}`);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const { timetable, setup, summary } = data;
  const tracking = setup.status === 'tracking';
  const base = `/timetables/${timetable.id}` as const;
  const targets: Partial<Record<SetupStep['key'], () => void>> = {
    dates: () => router.push(`${base}/details`),
    subjects: () => router.push(`${base}/subjects`),
    grid: () => router.push(`${base}/grid`),
    holidays: () => router.push(`${base}/calendar`),
  };
  const missing = setup.steps.filter((step) => step.required && !step.done);

  const start = async () => {
    setStarting(true);
    setMessage(null);
    try {
      await api.startTracking(timetable.id);
      router.dismissTo('/');
    } catch (failure) {
      setMessage(problemFrom(failure).message);
      setStarting(false);
      refresh();
    }
  };

  return (
    <Page refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: timetable.name }} />
      <OfflineNotice savedAt={savedAt} />
      <ErrorNotice message={message ?? error} />
      {summary ? (
        <>
          <View style={styles.markButtons}>
            <View style={styles.markButton}>
              <Button title="Mark attendance" onPress={() => router.push(`${base}/days/${localDate()}`)} />
            </View>
            <View style={styles.markButton}>
              <Button title="Month view" variant="secondary" onPress={() => router.push(`${base}/month`)} />
            </View>
          </View>
          <Dashboard summary={summary} onOpenSubject={(subjectId) => router.push(`${base}/subject/${subjectId}`)} />
        </>
      ) : null}
      {tracking ? (
        <>
          <SectionTitle>Timetable</SectionTitle>
          <Muted>Changes here update your attendance straight away.</Muted>
        </>
      ) : (
        <Muted>Fill these in, then press Start Tracking. Every class counts as attended until you mark it otherwise. You can change all of this later.</Muted>
      )}
      <ListBox>
        {setup.steps.map((step, index) => (
          <ListRow
            key={step.key}
            title={`${STEP_TITLES[step.key]}${step.required || tracking ? '' : ' (optional)'}`}
            detail={step.key === 'dates' ? datesDetail(timetable) : friendlyDates(step.message)}
            left={tracking ? undefined : <Mark step={step} index={index} />}
            onPress={targets[step.key]}
          />
        ))}
        {tracking ? (
          <ListRow
            title="Official numbers"
            detail={summary?.checkpoint ? `Using the college’s numbers up to ${formatDate(summary.checkpoint.asOf)}` : 'Enter the attendance the college shares, typed in or from the class sheet'}
            onPress={() => router.push(`${base}/official`)}
          />
        ) : null}
      </ListBox>
      {!tracking ? (
        <View style={styles.start}>
          <Button title="Start Tracking" onPress={start} busy={starting} disabled={!setup.ready} />
          {!setup.ready ? <Text style={styles.startNote}>Still needed: {missing.map((step) => STEP_TITLES[step.key].toLowerCase()).join(' and ')}.</Text> : null}
        </View>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  mark: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  markDone: { backgroundColor: tones.good.background, borderColor: tones.good.background },
  markText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  markTextDone: { color: tones.good.text },
  start: { marginTop: space.xl },
  markButtons: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  markButton: { flex: 1 },
  startNote: { fontSize: 13, color: colors.muted, marginTop: space.sm, textAlign: 'center' },
});
