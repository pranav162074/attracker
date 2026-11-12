import { useCallback, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../../../session.tsx';
import { problemFrom } from '../../../../lib/forms.ts';
import { shareMessage } from '../../../../lib/share.ts';
import { useLoad } from '../../../../useLoad.ts';
import { Button } from '../../../../ui/Button.tsx';
import { ErrorNotice } from '../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Muted, Page } from '../../../../ui/Page.tsx';
import { colors, space } from '../../../../ui/theme.ts';

const loadShare = async (id: number) => {
  const [timetable, code] = await Promise.all([api.timetable(id), api.shareCode(id)]);
  return { timetable, code };
};

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => loadShare(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  const code = made ?? data.code;

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setMade(await api.createShareCode(timetableId));
    } catch (failure) {
      setMessage(problemFrom(failure).message);
    }
    setBusy(false);
  };

  const send = async () => {
    if (!code) return;
    try {
      await Share.share({ message: shareMessage(code, data.timetable.name) });
    } catch {
      setMessage('Could not open sharing here. Copy the code above and send it yourself.');
    }
  };

  return (
    <Page>
      <Text style={styles.title} role="heading">
        Share with classmates
      </Text>
      <Muted>
        A classmate in the same class can copy {data.timetable.name} with this code instead of typing it all in: the dates and rules, subjects, weekly timetable and holidays. They get their
        own copy to change freely, like swapping in their open elective.
      </Muted>
      <Muted>Your attendance, marks and official numbers are never shared, and neither is your email.</Muted>
      <ErrorNotice message={message} />
      {code ? (
        <View style={styles.box}>
          <Text style={styles.label}>Share code</Text>
          <Text style={styles.code} selectable aria-label={`Share code ${code.split('').join(' ')}`}>
            {code}
          </Text>
          <Button title="Send the code" onPress={send} />
          <Text style={styles.note}>The code keeps working as long as this semester exists. Copies already made stay with your classmates even if you change or delete yours.</Text>
        </View>
      ) : (
        <Button title="Create a share code" onPress={create} busy={busy} />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: space.md },
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, gap: space.md, marginTop: space.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted },
  code: { fontSize: 32, fontWeight: '700', letterSpacing: 3, color: colors.text, fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, color: colors.muted, lineHeight: 18 },
});
