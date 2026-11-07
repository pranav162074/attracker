import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../../session.tsx';
import { loadSemesters } from '../../../currentSemester.ts';
import { findLine, subjectCount, subjectsFrom, subjectsNote, subjectTone } from '../../../lib/dashboard.ts';
import { byAttention, resumeStep, setupPath, shortLine } from '../../../lib/semester.ts';
import { useLoad } from '../../../useLoad.ts';
import { FinishSetup, NoSemester } from '../../../screens/NoSemester.tsx';
import { SemesterHeader } from '../../../screens/SemesterHeader.tsx';
import { Dot } from '../../../ui/Controls.tsx';
import { OfflineNotice } from '../../../ui/OfflineNotice.tsx';
import { LoadFailed, Loading, Muted, TabPage } from '../../../ui/Page.tsx';
import { colors, space, tones } from '../../../ui/theme.ts';

const loadSubjects = async () => {
  const { list, currentId } = await loadSemesters();
  const current = list.find((item) => item.timetableId === currentId) ?? null;
  if (!current) return { list, currentId, current, summary: null, setup: null };
  if (current.status === 'setup') return { list, currentId, current, summary: null, setup: await api.setup(current.timetableId) };
  return { list, currentId, current, summary: await api.summary(current.timetableId), setup: null };
};

export default function SubjectsTab() {
  const router = useRouter();
  const load = useCallback(() => loadSubjects(), []);
  const { data, error, loading, refreshing, refresh, savedAt } = useLoad(load, 'subjects-tab');

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  const { list, currentId, current, summary, setup } = data;
  const since = summary ? subjectsFrom(summary) : null;
  const note = summary ? subjectsNote(summary) : null;

  return (
    <TabPage refreshing={refreshing} onRefresh={refresh}>
      <SemesterHeader title="Subjects" list={list} currentId={currentId} onChanged={refresh} />
      <OfflineNotice savedAt={savedAt} />
      {!current ? <NoSemester /> : null}
      {current && setup ? <FinishSetup semester={current} onContinue={() => router.push(setupPath(current.timetableId, resumeStep(setup.steps)))} /> : null}
      {current && summary ? (
        <>
          {note ? <Muted>{note}</Muted> : null}
          {summary.subjects.length === 0 ? (
            <Muted>No subjects count for attendance yet.</Muted>
          ) : (
            <View style={styles.list}>
              {byAttention(summary.subjects).map((row) => {
                const tone = subjectTone(row);
                const need = row.held === 0 ? null : shortLine(findLine(row, 'required'), row.unitsPerClass);
                return (
                  <Pressable
                    key={row.subjectId}
                    role="button"
                    aria-label={row.name}
                    onPress={() => router.push(`/timetables/${current.timetableId}/subject/${row.subjectId}`)}
                    style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
                  >
                    <View style={styles.dot}>
                      <Dot colour={row.colour} />
                    </View>
                    <View style={styles.main}>
                      <Text style={styles.name}>{row.name}</Text>
                      <Text style={styles.detail}>{[subjectCount(row, since), need].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Text style={[styles.percent, { color: tone === 'neutral' ? colors.muted : tone === 'good' ? colors.text : tones[tone].text }]}>
                      {row.percent === null ? '–' : `${row.percentText}%`}
                    </Text>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={styles.foot}>Subjects needing attention come first. Subjects set as not counted, like library or counselling, are left out.</Text>
        </>
      ) : null}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surface },
  dot: { alignSelf: 'flex-start', paddingTop: 5 },
  main: { flex: 1 },
  name: { fontSize: 15, fontWeight: '500', color: colors.text },
  detail: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  percent: { fontSize: 16, fontWeight: '700' },
  chevron: { fontSize: 20, color: colors.muted },
  foot: { fontSize: 13, color: colors.muted, marginTop: space.md, lineHeight: 18 },
});
