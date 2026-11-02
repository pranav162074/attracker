import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { api } from '../../../../session.tsx';
import type { FieldErrors, Timetable } from '../../../../lib/api.ts';
import { problemFrom } from '../../../../lib/forms.ts';
import { checkTimetableForm, timetableFormFrom } from '../../../../lib/setupForms.ts';
import type { TimetableForm } from '../../../../lib/setupForms.ts';
import { TimetableFields } from '../../../../screens/TimetableFields.tsx';
import { useLoad } from '../../../../useLoad.ts';
import { Button } from '../../../../ui/Button.tsx';
import { ConfirmButton } from '../../../../ui/ConfirmButton.tsx';
import { ErrorNotice } from '../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Page, SectionTitle } from '../../../../ui/Page.tsx';
import { space } from '../../../../ui/theme.ts';

const Editor = ({ timetable }: { timetable: Timetable }) => {
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
      router.back();
    } catch (error) {
      const problem = problemFrom(error);
      setErrors(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteTimetable(timetable.id);
      router.dismissTo('/');
    } catch (error) {
      setMessage(problemFrom(error).message);
    }
  };

  return (
    <Page>
      <ErrorNotice message={message} />
      <TimetableFields form={form} errors={errors} onChange={setForm} />
      <Button title="Save" onPress={save} busy={busy} />
      <View style={styles.danger}>
        <SectionTitle>Delete timetable</SectionTitle>
        <ConfirmButton
          title="Delete this timetable"
          question={`Delete "${timetable.name}" with all its subjects, classes and attendance? This cannot be undone.`}
          confirmTitle="Delete"
          onConfirm={remove}
        />
      </View>
    </Page>
  );
};

export default function TimetableDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => api.timetable(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  return <Editor timetable={data} />;
}

const styles = StyleSheet.create({
  danger: { marginTop: space.xl },
});
