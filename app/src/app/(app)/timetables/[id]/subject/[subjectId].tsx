import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../../session.tsx';
import { ApiError } from '../../../../../lib/api.ts';
import type { HistoryEvent } from '../../../../../lib/api.ts';
import { condonationMessage, findLine, missedLine, subjectCount, subjectTone } from '../../../../../lib/dashboard.ts';
import { formatDate } from '../../../../../lib/dates.ts';
import { lineMessage, localDate } from '../../../../../lib/format.ts';
import { KIND_LABELS } from '../../../../../lib/setupForms.ts';
import { eventText, eventTone, eventWhen, missedTotal, splitHistory, subjectOutlook, weeklyLoad, weeklySlots } from '../../../../../lib/subject.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { Dot } from '../../../../../ui/Controls.tsx';
import { LoadFailed, Loading, Muted, Page, SectionTitle } from '../../../../../ui/Page.tsx';
import { colors, space, tones } from '../../../../../ui/theme.ts';

const loadSubject = async (id: number, subjectId: number) => {
  const [summary, history, grid, subjects] = await Promise.all([api.summary(id), api.subjectHistory(id, subjectId), api.grid(id), api.subjects(id, true)]);
  const subject = subjects.find((item) => item.id === subjectId);
  if (!subject) throw new ApiError(404, 'not_found', 'This subject no longer exists.');
  const row = summary.subjects.find((item) => item.subjectId === subjectId) ?? null;
  return { summary, history, grid, subjects, subject, row };
};

const EventRow = ({ event, otherName, onPress }: { event: HistoryEvent; otherName: string | null; onPress: () => void }) => {
  const tone = eventTone(event);
  return (
    <Pressable role="button" aria-label={eventWhen(event)} onPress={onPress} style={({ pressed }) => [styles.event, pressed ? styles.eventPressed : null]}>
      <View style={[styles.eventMark, { backgroundColor: tone === 'neutral' ? colors.border : tones[tone].text }]} />
      <View style={styles.eventText}>
        <Text style={styles.eventWhen}>{eventWhen(event)}</Text>
        <Text style={styles.eventWhat}>
          {eventText(event, otherName)}
          {event.beforeCheckpoint ? ' (covered by official numbers)' : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
};

export default function SubjectPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; subjectId: string }>();
  const timetableId = Number(params.id);
  const subjectId = Number(params.subjectId);
  const load = useCallback(() => loadSubject(timetableId, subjectId), [timetableId, subjectId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const { summary, history, grid, subjects, subject, row } = data;
  const names = new Map(subjects.map((item) => [item.id, item.name]));
  const { coming, past } = splitHistory(history.events, localDate());
  const tone = row ? subjectTone(row) : 'neutral';
  const units = row?.unitsPerClass ?? 1;
  const messages = row && row.held > 0 ? [lineMessage(findLine(row, 'required'), units), condonationMessage(row)].filter((text): text is string => Boolean(text)) : [];
  const outlook = row ? subjectOutlook(row) : null;
  const missed = missedTotal(history.events);
  const openDay = (date: string) => router.push(`/timetables/${timetableId}/days/${date}`);

  return (
    <Page refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: subject.shortName ?? subject.name }} />
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Dot colour={subject.colour} />
          <Text style={styles.name}>{subject.name}</Text>
        </View>
        <Text style={styles.kind}>
          {KIND_LABELS[subject.kind]}
          {subject.countsAttendance ? '' : ', not counted for attendance'}
          {subject.archived ? ', archived' : ''}
        </Text>
        {row ? (
          <>
            {row.percent !== null ? <Text style={[styles.percent, { color: tone === 'neutral' ? colors.text : tones[tone].text }]}>{row.percentText}%</Text> : null}
            <Text style={styles.muted}>{[subjectCount(row), missedLine(row, units)].filter(Boolean).join(' · ')}</Text>
            {messages.map((text) => (
              <Text key={text} style={styles.message}>
                {text}
              </Text>
            ))}
            {outlook ? <Text style={styles.outlook}>{outlook}</Text> : null}
            {summary.checkpoint ? <Text style={styles.note}>Uses the official numbers up to {formatDate(summary.checkpoint.asOf)}, then your own marks.</Text> : null}
          </>
        ) : (
          <Text style={styles.muted}>{subject.countsAttendance ? 'No classes yet.' : 'This subject is not counted, so it has no percentage.'}</Text>
        )}
      </View>

      <SectionTitle>Each week</SectionTitle>
      <Text style={styles.load}>{weeklyLoad(grid.slots, subject.id, subject.countPerSession)}</Text>
      {weeklySlots(grid.slots, subject.id).map((line) => (
        <Text key={line} style={styles.slot}>
          {line}
        </Text>
      ))}

      {coming.length > 0 ? (
        <>
          <SectionTitle>Coming up</SectionTitle>
          <View style={styles.list}>
            {coming.map((event) => (
              <EventRow key={`${event.date}-${event.start}-${event.kind}`} event={event} otherName={event.otherSubjectId ? (names.get(event.otherSubjectId) ?? null) : null} onPress={() => openDay(event.date)} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle>{missed > 0 ? `Missed and changed (${units > 1 ? `${missed} periods missed` : `${missed} missed`})` : 'Missed and changed'}</SectionTitle>
      {past.length === 0 ? (
        <Muted>Nothing so far. Every class of this subject counted as attended.</Muted>
      ) : (
        <View style={styles.list}>
          {past.map((event) => (
            <EventRow key={`${event.date}-${event.start}-${event.kind}`} event={event} otherName={event.otherSubjectId ? (names.get(event.otherSubjectId) ?? null) : null} onPress={() => openDay(event.date)} />
          ))}
        </View>
      )}

      <View style={styles.edit}>
        <Button title="Edit subject" variant="secondary" onPress={() => router.push(`/timetables/${timetableId}/subjects/${subject.id}`)} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  kind: { fontSize: 13, color: colors.muted, marginTop: 2 },
  percent: { fontSize: 36, fontWeight: '600', marginTop: space.sm },
  muted: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  message: { fontSize: 15, color: colors.text, marginTop: space.md, lineHeight: 21 },
  outlook: { fontSize: 14, color: colors.text, marginTop: space.md, lineHeight: 20 },
  note: { fontSize: 13, color: colors.muted, marginTop: space.md },
  load: { fontSize: 15, color: colors.text, marginBottom: space.xs },
  slot: { fontSize: 14, color: colors.muted, marginTop: 2 },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  event: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.background },
  eventPressed: { backgroundColor: colors.surface },
  eventMark: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  eventText: { flex: 1 },
  eventWhen: { fontSize: 15, color: colors.text, fontWeight: '500' },
  eventWhat: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.muted },
  edit: { marginTop: space.xl },
});
