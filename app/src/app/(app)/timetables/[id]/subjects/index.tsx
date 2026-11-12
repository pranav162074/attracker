import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../../../../session.tsx';
import { subjectNote } from '../../../../../lib/setupForms.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { Dot, ListBox, ListRow } from '../../../../../ui/Controls.tsx';
import { LoadFailed, Loading, Muted, Page, SectionTitle } from '../../../../../ui/Page.tsx';
import { colors, space } from '../../../../../ui/theme.ts';
import { SetupFooter, SetupIntro, SetupProgress } from '../../../../../screens/SetupFrame.tsx';
import { isSetup } from '../../../../../setupFlow.ts';

export default function Subjects() {
  const router = useRouter();
  const { id, setup, copied } = useLocalSearchParams<{ id: string; setup?: string; copied?: string }>();
  const inSetup = isSetup(setup);
  const timetableId = Number(id);
  const load = useCallback(() => api.subjects(timetableId, true), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  const [showArchived, setShowArchived] = useState(false);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const active = data.filter((subject) => !subject.archived);
  const archived = data.filter((subject) => subject.archived);
  const open = (subjectId: number | 'new') => router.push(`/timetables/${timetableId}/subjects/${subjectId}`);

  return (
    <Page refreshing={refreshing} onRefresh={refresh}>
      {inSetup ? <SetupProgress route="subjects" /> : null}
      {inSetup ? <SetupIntro title="Subjects">Add each subject once. Add a lab as its own subject; labs count every period.</SetupIntro> : null}
      {copied === '1' ? (
        <View style={styles.copied}>
          <Text style={styles.copiedTitle}>Copied from your classmate</Text>
          <Text style={styles.copiedBody}>
            Change anything that is different for you. For a different open elective, tap that subject and rename it: its classes in the weekly timetable stay where they are.
          </Text>
        </View>
      ) : null}
      <Muted>Add theory classes and labs as separate subjects. Library, sports or counselling can be added as Other, so they show on the timetable without counting for attendance.</Muted>
      {active.length > 0 ? (
        <ListBox>
          {active.map((subject) => (
            <ListRow
              key={subject.id}
              title={subject.shortName ? `${subject.name} (${subject.shortName})` : subject.name}
              detail={subjectNote(subject)}
              left={<Dot colour={subject.colour} />}
              onPress={() => open(subject.id)}
            />
          ))}
        </ListBox>
      ) : (
        <Muted>No subjects yet.</Muted>
      )}
      <View style={styles.add}>
        <Button title="Add a subject" onPress={() => open('new')} />
      </View>
      {archived.length > 0 ? (
        <>
          <SectionTitle>Archived</SectionTitle>
          {showArchived ? (
            <ListBox>
              {archived.map((subject) => (
                <ListRow key={subject.id} title={subject.name} detail={subjectNote(subject)} left={<Dot colour={subject.colour} />} onPress={() => open(subject.id)} />
              ))}
            </ListBox>
          ) : (
            <Button title={`Show ${archived.length} archived`} variant="secondary" onPress={() => setShowArchived(true)} />
          )}
        </>
      ) : null}
      {inSetup ? <SetupFooter timetableId={timetableId} route="subjects" /> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  copied: { backgroundColor: colors.infoBackground, borderRadius: 8, padding: space.lg, marginBottom: space.lg },
  copiedTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  copiedBody: { fontSize: 14, color: colors.text, lineHeight: 20 },
  add: { marginTop: space.lg },
});
