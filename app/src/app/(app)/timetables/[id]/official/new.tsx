import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../../../../session.tsx';
import { newOfficialForm } from '../../../../../lib/official.ts';
import { OfficialEditor } from '../../../../../screens/OfficialEditor.tsx';
import { isSetup } from '../../../../../setupFlow.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { LoadFailed, Loading, Muted, Page } from '../../../../../ui/Page.tsx';

const loadAll = async (id: number) => {
  const [timetable, subjects] = await Promise.all([api.timetable(id), api.subjects(id, true)]);
  return { timetable, subjects };
};

export default function TypeOfficialNumbers() {
  const { id, setup } = useLocalSearchParams<{ id: string; setup?: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => loadAll(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  return (
    <Page>
      <OfficialEditor timetable={data.timetable} subjects={data.subjects} initial={newOfficialForm(data.subjects)} source="manual" setup={isSetup(setup)}>
        <Muted>Copy the numbers from the attendance the college shared, subject by subject.</Muted>
      </OfficialEditor>
    </Page>
  );
}
