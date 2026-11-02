import { useCallback, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { api } from '../../../../../session.tsx';
import { ApiError } from '../../../../../lib/api.ts';
import type { FieldErrors, Subject, SubjectKind } from '../../../../../lib/api.ts';
import { problemFrom } from '../../../../../lib/forms.ts';
import { checkSubjectForm, KIND_LABELS, newSubjectForm, PALETTE, subjectFormFrom, withKind } from '../../../../../lib/setupForms.ts';
import type { SubjectForm } from '../../../../../lib/setupForms.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { ConfirmButton } from '../../../../../ui/ConfirmButton.tsx';
import { ColourPicker, Segmented, SwitchRow } from '../../../../../ui/Controls.tsx';
import { ErrorNotice } from '../../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Page, SectionTitle } from '../../../../../ui/Page.tsx';
import { TextField } from '../../../../../ui/TextField.tsx';
import { space } from '../../../../../ui/theme.ts';

const KINDS: { value: SubjectKind; label: string }[] = (['theory', 'lab', 'other'] as const).map((value) => ({ value, label: KIND_LABELS[value] }));

const Editor = ({ timetableId, subject }: { timetableId: number; subject: Subject | null }) => {
  const router = useRouter();
  const [form, setForm] = useState<SubjectForm>(() => (subject ? subjectFormFrom(subject) : newSubjectForm()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SubjectForm>(key: K, value: SubjectForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const run = async (action: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await action();
      router.back();
    } catch (error) {
      const problem = problemFrom(error);
      setErrors(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  };

  const save = () => {
    const { input, errors: problems } = checkSubjectForm(form);
    setErrors(problems);
    if (!input) return;
    setBusy(true);
    run(() => (subject ? api.updateSubject(timetableId, subject.id, input) : api.createSubject(timetableId, input)));
  };

  const remove = async () => {
    if (!subject) return;
    try {
      await api.deleteSubject(timetableId, subject.id);
      router.back();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'subject_in_use') {
        setMessage('This subject is in the weekly timetable or has attendance, so it cannot be deleted. Archive it instead: it disappears from lists but its history is kept.');
        return;
      }
      setMessage(problemFrom(error).message);
    }
  };

  return (
    <Page>
      <Stack.Screen options={{ title: subject ? subject.name : 'New subject' }} />
      <ErrorNotice message={message} />
      <TextField label="Name" value={form.name} onChangeText={(value) => set('name', value)} error={errors.name} placeholder="Computer Networks" maxLength={80} autoCapitalize="words" />
      <TextField
        label="Short name (optional)"
        value={form.shortName}
        onChangeText={(value) => set('shortName', value)}
        error={errors.shortName}
        placeholder="CN"
        maxLength={12}
        autoCapitalize="characters"
      />
      <Segmented label="Kind" options={KINDS} value={form.kind} onChange={(kind) => setForm((current) => withKind(current, kind))} />
      <SwitchRow
        label="Counts for attendance"
        detail={form.kind === 'other' ? 'Usually off for library, sports or counselling.' : undefined}
        value={form.countsAttendance}
        onChange={(value) => set('countsAttendance', value)}
      />
      <SwitchRow
        label="Count each class as one"
        detail={form.countPerSession ? 'A 3-period class counts as 1.' : 'A 3-period class counts as 3, like most college labs.'}
        value={form.countPerSession}
        onChange={(value) => set('countPerSession', value)}
        disabled={!form.countsAttendance}
      />
      <ColourPicker label={subject ? 'Colour' : 'Colour (picked for you if you skip this)'} colours={PALETTE} value={form.colour} onChange={(value) => set('colour', value)} />
      <Button title={subject ? 'Save' : 'Add subject'} onPress={save} busy={busy} />

      {subject ? (
        <View style={styles.more}>
          <SectionTitle>{subject.archived ? 'Archived' : 'Archive or delete'}</SectionTitle>
          <View style={styles.stack}>
            <Button
              title={subject.archived ? 'Bring back from archive' : 'Archive'}
              variant="secondary"
              onPress={() => run(() => api.updateSubject(timetableId, subject.id, { archived: !subject.archived }))}
            />
            <ConfirmButton title="Delete" question={`Delete ${subject.name}? This only works if it was never used.`} confirmTitle="Delete" onConfirm={remove} />
          </View>
        </View>
      ) : null}
    </Page>
  );
};

const findSubject = async (timetableId: number, subjectId: number) => {
  const subjects = await api.subjects(timetableId, true);
  const subject = subjects.find((item) => item.id === subjectId);
  if (!subject) throw new ApiError(404, 'not_found', 'This subject no longer exists.');
  return subject;
};

const Existing = ({ timetableId, subjectId }: { timetableId: number; subjectId: number }) => {
  const load = useCallback(() => findSubject(timetableId, subjectId), [timetableId, subjectId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  return <Editor key={`${data.id}-${data.archived}`} timetableId={timetableId} subject={data} />;
};

export default function SubjectScreen() {
  const { id, subjectId } = useLocalSearchParams<{ id: string; subjectId: string }>();
  const timetableId = Number(id);
  if (subjectId === 'new') return <Editor timetableId={timetableId} subject={null} />;
  return <Existing timetableId={timetableId} subjectId={Number(subjectId)} />;
}

const styles = StyleSheet.create({
  more: { marginTop: space.xl },
  stack: { gap: space.md },
});
