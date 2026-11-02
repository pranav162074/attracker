import { useState } from 'react';
import { useRouter } from 'expo-router';
import { api } from '../../../session.tsx';
import type { FieldErrors } from '../../../lib/api.ts';
import { deviceTimeZone } from '../../../lib/dates.ts';
import { problemFrom } from '../../../lib/forms.ts';
import { checkTimetableForm, newTimetableForm } from '../../../lib/setupForms.ts';
import { TimetableFields } from '../../../screens/TimetableFields.tsx';
import { Button } from '../../../ui/Button.tsx';
import { ErrorNotice } from '../../../ui/Notice.tsx';
import { Page } from '../../../ui/Page.tsx';

export default function NewTimetable() {
  const router = useRouter();
  const [form, setForm] = useState(newTimetableForm);
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
      const timetable = await api.createTimetable({ ...input, timeZone: deviceTimeZone() });
      router.replace(`/timetables/${timetable.id}`);
    } catch (error) {
      const problem = problemFrom(error);
      setErrors(problem.fields);
      setMessage(problem.message);
      setBusy(false);
    }
  };

  return (
    <Page>
      <ErrorNotice message={message} />
      <TimetableFields form={form} errors={errors} onChange={setForm} />
      <Button title="Create timetable" onPress={save} busy={busy} />
    </Page>
  );
}
