import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../session.tsx';
import { formatDate } from '../../../../lib/dates.ts';
import { problemFrom } from '../../../../lib/forms.ts';
import { localDate } from '../../../../lib/format.ts';
import { setupPath } from '../../../../lib/semester.ts';
import { startAndOpen } from '../../../../setupFlow.ts';
import { useLoad } from '../../../../useLoad.ts';
import { SetupIntro, SetupProgress } from '../../../../screens/SetupFrame.tsx';
import { Button } from '../../../../ui/Button.tsx';
import { ErrorNotice } from '../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Page } from '../../../../ui/Page.tsx';
import { colors, space } from '../../../../ui/theme.ts';

type Answer = 'no' | 'sheet' | 'manual' | 'overall' | 'none';

const Option = ({ title, detail, selected, onPress }: { title: string; detail?: string; selected: boolean; onPress: () => void }) => (
  <Pressable role="radio" aria-checked={selected} aria-label={title} onPress={onPress} style={[styles.option, selected ? styles.selected : null]}>
    <Text style={styles.optionTitle}>{title}</Text>
    {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
  </Pressable>
);

export default function Started() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => api.timetable(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const begun = data.startsOn < localDate();
  const official = answer === 'sheet' || answer === 'manual' || answer === 'overall';

  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await startAndOpen(timetableId);
    } catch (failure) {
      setMessage(problemFrom(failure).message);
      setBusy(false);
    }
  };

  const go = () => {
    if (!answer) {
      setMessage('Choose one of the options.');
      return;
    }
    if (!official) {
      start();
      return;
    }
    const screen = answer === 'sheet' ? 'sheet' : answer === 'manual' ? 'new' : 'overall';
    router.push(`/timetables/${timetableId}/official/${screen}?setup=1`);
  };

  return (
    <Page>
      <SetupProgress route="started" />
      <SetupIntro title={begun ? 'Have classes already started?' : 'Ready to start'}>
        {begun
          ? `The semester began on ${formatDate(data.startsOn)}. If the college has given you attendance, add it so the earlier weeks match the college’s count.`
          : `Classes begin on ${formatDate(data.startsOn)}. Press Start tracking and every class counts as attended until you mark it otherwise.`}
      </SetupIntro>
      {begun ? (
        <View>
          <Option title="No, I am starting from the first day" selected={answer === 'no'} onPress={() => setAnswer('no')} />
          <Text style={styles.group}>Yes, and I have the college’s attendance:</Text>
          <Option title="From the attendance sheet" detail="Upload the Excel file and pick your row" selected={answer === 'sheet'} onPress={() => setAnswer('sheet')} />
          <Option title="Type it in per subject" detail="Held and attended for each subject" selected={answer === 'manual'} onPress={() => setAnswer('manual')} />
          <Option title="I only know the overall %" detail="Like 70.24% up to 31 Oct" selected={answer === 'overall'} onPress={() => setAnswer('overall')} />
          <Option
            title="Yes, but I don’t have any numbers"
            detail="Every earlier class counts as attended. You can mark the days you missed on the calendar."
            selected={answer === 'none'}
            onPress={() => setAnswer('none')}
          />
        </View>
      ) : null}
      <ErrorNotice message={message} />
      <View style={styles.buttons}>
        <View style={styles.button}>
          <Button title="Back" variant="secondary" onPress={() => router.replace(setupPath(timetableId, 'calendar'))} />
        </View>
        <View style={styles.button}>
          <Button title={official ? 'Continue' : 'Start tracking'} onPress={begun ? go : start} busy={busy} />
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: space.md,
    marginBottom: space.sm,
  },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionDetail: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 18,
  },
  group: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  buttons: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  button: { flex: 1 },
});
