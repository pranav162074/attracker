import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../../session.tsx';
import type { Checkpoint } from '../../../../../lib/api.ts';
import { problemFrom } from '../../../../../lib/forms.ts';
import { checkpointTitle, checkpointTotals, formatBp, truncatedPercent } from '../../../../../lib/official.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { ConfirmButton } from '../../../../../ui/ConfirmButton.tsx';
import { ErrorNotice } from '../../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Muted, Page, SectionTitle } from '../../../../../ui/Page.tsx';
import { colors, space, tones } from '../../../../../ui/theme.ts';

const Saved = ({ checkpoint, latest, names, onDelete }: { checkpoint: Checkpoint; latest: boolean; names: Map<number, string>; onDelete: () => Promise<void> }) => {
  const totals = checkpointTotals(checkpoint);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{checkpointTitle(checkpoint)}</Text>
        {latest ? <Text style={styles.inUse}>In use</Text> : null}
      </View>
      {checkpoint.overallBp !== null ? (
        <Text style={styles.cardTotal}>
          {formatBp(checkpoint.overallBp)}% overall, counted as {totals.attended} of {totals.held} classes
        </Text>
      ) : (
        <Text style={styles.cardTotal}>
          {totals.attended} of {totals.held} attended{truncatedPercent(totals.attended, totals.held) ? `, ${truncatedPercent(totals.attended, totals.held)}` : ''}
        </Text>
      )}
      {checkpoint.subjects.map((row) => (
        <Text key={row.subjectId} style={styles.cardLine}>
          {names.get(row.subjectId) ?? 'Subject'}: {row.attended} of {row.held}
        </Text>
      ))}
      {checkpoint.freeHeld > 0 && checkpoint.overallBp === null ? (
        <Text style={styles.cardLine}>
          Other hours: {checkpoint.freeAttended} of {checkpoint.freeHeld}
        </Text>
      ) : null}
      <View style={styles.cardActions}>
        <ConfirmButton title="Remove" question="Remove these official numbers? Your attendance goes back to the app’s own count for those days." confirmTitle="Remove" onConfirm={onDelete} />
      </View>
    </View>
  );
};

const loadAll = async (id: number) => {
  const [checkpoints, subjects] = await Promise.all([api.checkpoints(id), api.subjects(id, true)]);
  return { checkpoints, subjects };
};

export default function OfficialNumbers() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => loadAll(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const names = new Map(data.subjects.map((subject) => [subject.id, subject.name]));
  const base = `/timetables/${timetableId}/official` as const;

  return (
    <Page refreshing={refreshing} onRefresh={refresh}>
      <Muted>
        When the college shares attendance, enter its numbers here. Up to that date the app uses the college’s numbers instead of its own count, and your own marks take over from the next day. Only the latest entry is used.
      </Muted>
      <View style={styles.actions}>
        <Button title="Read from the class attendance sheet" onPress={() => router.push(`${base}/sheet`)} />
        <Button title="Type the numbers in" variant="secondary" onPress={() => router.push(`${base}/new`)} />
        <Button title="I only know the overall percentage" variant="secondary" onPress={() => router.push(`${base}/overall`)} />
      </View>
      <ErrorNotice message={message} />
      <SectionTitle>Saved</SectionTitle>
      {data.checkpoints.length === 0 ? (
        <Muted>Nothing saved yet. The app is using its own count.</Muted>
      ) : (
        data.checkpoints.map((checkpoint, index) => (
          <Saved
            key={checkpoint.id}
            checkpoint={checkpoint}
            latest={index === 0}
            names={names}
            onDelete={async () => {
              try {
                await api.deleteCheckpoint(timetableId, checkpoint.id);
                refresh();
              } catch (failure) {
                setMessage(problemFrom(failure).message);
              }
            }}
          />
        ))
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md, marginBottom: space.md },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, marginBottom: space.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  inUse: { fontSize: 12, fontWeight: '600', color: tones.good.text, backgroundColor: tones.good.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  cardTotal: { fontSize: 15, color: colors.text, marginTop: space.sm, marginBottom: space.xs },
  cardLine: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardActions: { marginTop: space.md },
});
