import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { loadSemesters } from '../../../currentSemester.ts';
import { api } from '../../../session.tsx';
import { resumeStep, setupPath } from '../../../lib/semester.ts';
import { useLoad } from '../../../useLoad.ts';
import { MonthView } from '../../../screens/MonthView.tsx';
import { FinishSetup, NoSemester } from '../../../screens/NoSemester.tsx';
import { SemesterHeader } from '../../../screens/SemesterHeader.tsx';
import { LoadFailed, Loading, TabPage } from '../../../ui/Page.tsx';

const loadCalendar = async () => {
  const { list, currentId } = await loadSemesters();
  const current = list.find((item) => item.timetableId === currentId) ?? null;
  return { list, currentId, current, setup: current?.status === 'setup' ? await api.setup(current.timetableId) : null };
};

export default function CalendarTab() {
  const router = useRouter();
  const load = useCallback(() => loadCalendar(), []);
  const { data, error, loading, refreshing, refresh } = useLoad(load, 'calendar-tab');
  const [month, setMonth] = useState<string | undefined>(undefined);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  const { list, currentId, current, setup } = data;

  return (
    <TabPage>
      <SemesterHeader title="Calendar" list={list} currentId={currentId} onChanged={refresh} />
      {!current ? <NoSemester /> : null}
      {current && setup ? <FinishSetup semester={current} onContinue={() => router.push(setupPath(current.timetableId, resumeStep(setup.steps)))} /> : null}
      {current && !setup ? <MonthView key={current.timetableId} timetableId={current.timetableId} month={month} onMonth={setMonth} /> : null}
    </TabPage>
  );
}
