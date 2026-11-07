import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../session.tsx';
import { startAndOpen } from '../setupFlow.ts';
import type { CheckpointInput, FieldErrors, Subject, Timetable } from '../lib/api.ts';
import { friendlyDates } from '../lib/dates.ts';
import { localDate } from '../lib/format.ts';
import { problemFrom } from '../lib/forms.ts';
import { checkOfficial, countedSubjects, formTotals, truncatedPercent } from '../lib/official.ts';
import type { CountPair, OfficialForm } from '../lib/official.ts';
import { Button } from '../ui/Button.tsx';
import { Dot } from '../ui/Controls.tsx';
import { DateField } from '../ui/DateField.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { Muted, SectionTitle } from '../ui/Page.tsx';
import { colors, space } from '../ui/theme.ts';

type Props = {
  timetable: Timetable;
  subjects: Subject[];
  initial: OfficialForm;
  source: CheckpointInput['source'];
  setup?: boolean;
  children?: ReactNode;
};

const NumberBox = ({ label, value, onChange, invalid }: { label: string; value: string; onChange: (value: string) => void; invalid: boolean }) => (
  <View style={styles.box}>
    <Text style={styles.boxLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={5}
      aria-label={label}
      style={[styles.input, invalid ? styles.inputError : null]}
    />
  </View>
);

const Row = ({ title, colour, pair, error, onChange }: { title: string; colour: string | null; pair: CountPair; error: string | undefined; onChange: (pair: CountPair) => void }) => (
  <View style={styles.row}>
    <View style={styles.rowTitle}>
      {colour !== null ? <Dot colour={colour} /> : null}
      <Text style={styles.rowName}>{title}</Text>
    </View>
    <View style={styles.boxes}>
      <NumberBox label={`${title} held`} value={pair.held} onChange={(held) => onChange({ ...pair, held })} invalid={Boolean(error)} />
      <NumberBox label={`${title} attended`} value={pair.attended} onChange={(attended) => onChange({ ...pair, attended })} invalid={Boolean(error)} />
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>
);

export const OfficialEditor = ({ timetable, subjects, initial, source, setup = false, children }: Props) => {
  const router = useRouter();
  const [form, setForm] = useState<OfficialForm>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = localDate();
  const totals = formTotals(form);
  const percent = truncatedPercent(totals.attended, totals.held);

  const save = async () => {
    const { input, errors: problems } = checkOfficial(form, subjects, timetable, today, source);
    setErrors(problems);
    setMessage(Object.keys(problems).length > 0 ? 'Some numbers need fixing. They are marked below.' : null);
    if (!input) return;
    setBusy(true);
    try {
      await api.saveCheckpoint(timetable.id, input);
      if (setup) await startAndOpen(timetable.id);
      else router.dismissTo('/');
    } catch (error) {
      const problem = problemFrom(error);
      setMessage(problem.message ? friendlyDates(problem.message) : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <>
      {children}
      <DateField
        label="These numbers are up to"
        value={form.asOf}
        onChange={(asOf) => setForm((current) => ({ ...current, asOf }))}
        error={errors.asOf}
        near={today < timetable.startsOn ? timetable.startsOn : today}
        hint="The last day the sheet covers. Your own marks count from the day after."
      />

      <SectionTitle>Subjects</SectionTitle>
      <Muted>Classes held and attended for each subject, as the college counts them. Labs are counted in periods.</Muted>
      <View style={styles.header}>
        <Text style={styles.headerSpacer} />
        <Text style={styles.headerLabel}>Held</Text>
        <Text style={styles.headerLabel}>Attended</Text>
      </View>
      <View style={styles.list}>
        {countedSubjects(subjects).map((subject) => (
          <Row
            key={subject.id}
            title={subject.name}
            colour={subject.colour}
            pair={form.rows[subject.id] ?? { held: '', attended: '' }}
            error={errors[`subject-${subject.id}`]}
            onChange={(pair) => setForm((current) => ({ ...current, rows: { ...current.rows, [subject.id]: pair } }))}
          />
        ))}
        <Row
          title="Other hours"
          colour={null}
          pair={{ held: form.freeHeld, attended: form.freeAttended }}
          error={errors.free}
          onChange={(pair) => setForm((current) => ({ ...current, freeHeld: pair.held, freeAttended: pair.attended }))}
        />
      </View>
      <Muted>Other hours are periods in the sheet’s total that belong to no subject, like library or seminars. Leave them empty if there are none.</Muted>

      <Text style={styles.total}>
        Total: {totals.attended} of {totals.held} attended{percent ? `, ${percent}` : ''}
      </Text>
      <ErrorNotice message={message} />
      <Button title={setup ? 'Save and start tracking' : 'Save'} onPress={save} busy={busy} />
    </>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', paddingHorizontal: space.md, marginBottom: space.xs },
  headerSpacer: { flex: 1 },
  headerLabel: { width: 76, textAlign: 'center', fontSize: 12, color: colors.muted, marginLeft: space.sm },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', marginBottom: space.md },
  row: { padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  rowTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 140 },
  rowName: { fontSize: 14, color: colors.text, flexShrink: 1 },
  boxes: { flexDirection: 'row' },
  box: { width: 76, marginLeft: space.sm },
  boxLabel: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingVertical: 8, paddingHorizontal: space.sm, fontSize: 16, textAlign: 'center', color: colors.text },
  inputError: { borderColor: colors.error },
  error: { width: '100%', color: colors.error, fontSize: 13, marginTop: space.xs },
  total: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space.md },
});
