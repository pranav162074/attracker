import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../session.tsx';
import type { FieldErrors, Timetable } from '../../../../lib/api.ts';
import { problemFrom } from '../../../../lib/forms.ts';
import { checkTimetableForm, timetableFormFrom } from '../../../../lib/setupForms.ts';
import type { TimetableForm } from '../../../../lib/setupForms.ts';
import { TimetableFields } from '../../../../screens/TimetableFields.tsx';
import { useLoad } from '../../../../useLoad.ts';
import { Button } from '../../../../ui/Button.tsx';
import { ErrorNotice } from '../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Page } from '../../../../ui/Page.tsx';
import { setupPath } from '../../../../lib/semester.ts';
import { SetupIntro, SetupProgress } from '../../../../screens/SetupFrame.tsx';
import { isSetup } from '../../../../setupFlow.ts';

const Editor = ({ timetable, setup }: { timetable: Timetable; setup: boolean }) => {
  const router = useRouter();
  const [form, setForm] = useState<TimetableForm>(() => timetableFormFrom(timetable));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const { input, errors: problems } = checkTimetableForm(form);
    setErrors(problems);
    setMessage(null);
    if (!input) return;
    setBusy(true);
    try {
      await api.updateTimetable(timetable.id, input);
      if (setup) router.replace(setupPath(timetable.id, 'subjects'));
      else router.back();
    } catch (error) {
      const problem = problemFrom(error);
      setErrors(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  };

  return (
    <Page>
      {setup ? <SetupProgress route="details" /> : null}
      {setup ? <SetupIntro title="Your semester">The days classes run, and your college’s attendance rule.</SetupIntro> : null}
      <ErrorNotice message={message} />
      <TimetableFields form={form} errors={errors} onChange={setForm} />
      <Button title={setup ? 'Next' : 'Save'} onPress={save} busy={busy} />
    </Page>
  );
};

export default function TimetableDetails() {
  const { id, setup } = useLocalSearchParams<{ id: string; setup?: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => api.timetable(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  return <Editor timetable={data} setup={isSetup(setup)} />;
}

