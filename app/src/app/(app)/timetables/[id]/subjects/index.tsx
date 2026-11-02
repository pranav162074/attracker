import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { api } from '../../../../../session.tsx';
import { subjectNote } from '../../../../../lib/setupForms.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { Dot, ListBox, ListRow } from '../../../../../ui/Controls.tsx';
import { LoadFailed, Loading, Muted, Page, SectionTitle } from '../../../../../ui/Page.tsx';
import { space } from '../../../../../ui/theme.ts';

export default function Subjects() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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
      <Muted>Add theory classes and labs as separate subjects. Things like library or sports can be added as Other, so they show in the timetable without counting for attendance.</Muted>
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
    </Page>
  );
}

const styles = StyleSheet.create({
  add: { marginTop: space.lg },
});
