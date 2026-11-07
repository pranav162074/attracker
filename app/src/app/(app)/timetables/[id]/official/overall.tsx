import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../../session.tsx';
import { isSetup, startAndOpen } from '../../../../../setupFlow.ts';
import type { FieldErrors, Timetable } from '../../../../../lib/api.ts';
import { friendlyDates } from '../../../../../lib/dates.ts';
import { localDate } from '../../../../../lib/format.ts';
import { problemFrom } from '../../../../../lib/forms.ts';
import { checkOverall, overallPreview, parseCount, parseOverallPercent } from '../../../../../lib/official.ts';
import type { OverallForm } from '../../../../../lib/official.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { DateField } from '../../../../../ui/DateField.tsx';
import { ErrorNotice } from '../../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Muted, Page } from '../../../../../ui/Page.tsx';
import { TextField } from '../../../../../ui/TextField.tsx';
import { colors, space } from '../../../../../ui/theme.ts';

const Editor = ({ timetable, setup }: { timetable: Timetable; setup: boolean }) => {
  const router = useRouter();
  const today = localDate();
  const [form, setForm] = useState<OverallForm>({ asOf: null, percent: '', held: '' });
  const [estimate, setEstimate] = useState<{ asOf: string; held: number } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const asOf = form.asOf;
    if (!asOf || asOf > today || asOf < timetable.startsOn) return;
    let active = true;
    api
      .estimateHeld(timetable.id, asOf)
      .then((held) => {
        if (active) setEstimate({ asOf, held });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [form.asOf, timetable.id, timetable.startsOn, today]);

  const bp = parseOverallPercent(form.percent).bp;
  const typed = parseCount(form.held);
  const estimated = estimate && estimate.asOf === form.asOf ? estimate.held : null;
  const held = typeof typed === 'number' && typed > 0 ? typed : estimated;
  const preview = bp !== null && held !== null && held > 0 ? overallPreview(bp, held, typeof typed === 'number' && typed > 0) : null;

  const save = async () => {
    const { input, errors: problems } = checkOverall(form, timetable, today);
    setErrors(problems);
    setMessage(null);
    if (!input) return;
    setBusy(true);
    try {
      await api.saveCheckpoint(timetable.id, input);
      if (setup) await startAndOpen(timetable.id);
      else router.dismissTo('/');
    } catch (error) {
      const problem = problemFrom(error);
      setErrors(problem.fields);
      setMessage(problem.message ? friendlyDates(problem.message) : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <>
      <Muted>
        For when you only know your overall attendance, like 70.24% up to 31 Oct. The app uses it up to that day and adds your own marks from the next day. Each subject is counted from the next day only.
      </Muted>
      <ErrorNotice message={message} />
      <DateField
        label="The percentage is up to"
        value={form.asOf}
        onChange={(asOf) => setForm((current) => ({ ...current, asOf }))}
        error={errors.asOf}
        near={today < timetable.startsOn ? timetable.startsOn : today}
        hint="The last day it covers. Your own marks count from the day after."
      />
      <TextField
        label="Overall attendance (%)"
        value={form.percent}
        onChangeText={(percent) => setForm((current) => ({ ...current, percent }))}
        error={errors.percent}
        placeholder="70.24"
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={7}
      />
      <TextField
        label="Classes held (optional)"
        value={form.held}
        onChangeText={(text) => setForm((current) => ({ ...current, held: text.replace(/[^0-9]/g, '') }))}
        error={errors.held}
        hint="Only if you know it. Otherwise the app counts the classes in your timetable up to that day, labs in periods."
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={5}
      />
      {preview ? (
        <View style={styles.preview}>
          <Text style={styles.previewText}>{preview}</Text>
        </View>
      ) : null}
      <Button title={setup ? 'Save and start tracking' : 'Save'} onPress={save} busy={busy} />
    </>
  );
};

export default function OverallOfficialNumbers() {
  const { id, setup } = useLocalSearchParams<{ id: string; setup?: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => api.timetable(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  return (
    <Page>
      <Editor timetable={data} setup={isSetup(setup)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  preview: { backgroundColor: colors.surface, borderRadius: 8, padding: space.md, marginBottom: space.lg },
  previewText: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
