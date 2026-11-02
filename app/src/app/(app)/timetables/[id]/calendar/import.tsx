import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../../../../session.tsx';
import type { ImportPreview } from '../../../../../lib/api.ts';
import { formatRange } from '../../../../../lib/calendar.ts';
import { friendlyDates } from '../../../../../lib/dates.ts';
import { problemFrom } from '../../../../../lib/forms.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { ListBox } from '../../../../../ui/Controls.tsx';
import { ErrorNotice } from '../../../../../ui/Notice.tsx';
import { Muted, Page, SectionTitle } from '../../../../../ui/Page.tsx';
import { TextField } from '../../../../../ui/TextField.tsx';
import { colors, space, tones } from '../../../../../ui/theme.ts';

type Found = ImportPreview['holidays'][number];

const Row = ({ holiday, checked, onToggle }: { holiday: Found; checked: boolean; onToggle: () => void }) => {
  const blocked = holiday.problems.length > 0;
  return (
    <Pressable
      role="checkbox"
      aria-checked={checked}
      aria-disabled={blocked}
      aria-label={formatRange(holiday.startsOn, holiday.endsOn)}
      disabled={blocked}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={[styles.box, checked ? styles.boxOn : null, blocked ? styles.boxBlocked : null]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, blocked ? styles.blockedText : null]}>{formatRange(holiday.startsOn, holiday.endsOn)}</Text>
        {holiday.label ? <Text style={styles.rowDetail}>{holiday.label}</Text> : null}
        {holiday.problems.map((problem) => (
          <Text key={problem} style={styles.problem}>
            {friendlyDates(problem)}
          </Text>
        ))}
        {holiday.warnings.map((warning) => (
          <Text key={warning} style={styles.warning}>
            {friendlyDates(warning)}
          </Text>
        ))}
      </View>
    </Pressable>
  );
};

export default function ImportHolidays() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);

  const read = async () => {
    if (!text.trim()) {
      setMessage('Paste the holiday list first.');
      return;
    }
    setBusy('read');
    setMessage(null);
    try {
      const result = await api.previewImport(timetableId, text);
      setPreview(result);
      setChosen(new Set(result.holidays.flatMap((holiday, index) => (holiday.problems.length === 0 ? [index] : []))));
      if (result.holidays.length === 0) setMessage('No dates were found. Each line needs a date like 15-08-2026, 15.08.2026 or 2026-08-15.');
    } catch (error) {
      setMessage(problemFrom(error).message);
    }
    setBusy(null);
  };

  const save = async () => {
    if (!preview) return;
    const days = preview.holidays
      .filter((_, index) => chosen.has(index))
      .map((holiday) => ({ kind: 'holiday' as const, startsOn: holiday.startsOn, endsOn: holiday.endsOn, followsWeekday: null, cutoff: null, label: holiday.label?.slice(0, 80) ?? null }));
    setBusy('save');
    setMessage(null);
    try {
      await api.addDays(timetableId, days);
      router.back();
    } catch (error) {
      setMessage(problemFrom(error).message);
      setBusy(null);
    }
  };

  const toggle = (index: number) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <Page>
      <Muted>Open your academic calendar, select the list of holidays, copy it, and paste it here. Lines with a date like 15-08-2026, 15.08.2026 or a range like 07-09-2026 to 12-09-2026 are picked up; the rest is ignored. Nothing is saved until you check the list.</Muted>
      <TextField
        label="Holiday list"
        value={text}
        onChangeText={(value) => {
          setText(value);
          setPreview(null);
        }}
        multiline
        textAlignVertical="top"
        style={styles.paste}
        placeholder={'15-08-2026  Independence Day\n02-10-2026  Gandhi Jayanthi'}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <ErrorNotice message={message} />
      {!preview ? <Button title="Read the list" onPress={read} busy={busy === 'read'} /> : null}

      {preview && preview.holidays.length > 0 ? (
        <>
          <SectionTitle>{preview.holidays.length === 1 ? 'Found 1 date' : `Found ${preview.holidays.length} dates`}</SectionTitle>
          <Muted>Untick anything that is not a holiday for you.</Muted>
          <ListBox>
            {preview.holidays.map((holiday, index) => (
              <Row key={`${holiday.startsOn}-${index}`} holiday={holiday} checked={chosen.has(index)} onToggle={() => toggle(index)} />
            ))}
          </ListBox>
          {preview.skipped.length > 0 ? (
            <View style={styles.skipped}>
              <Text style={styles.skippedTitle}>Lines without a date, ignored:</Text>
              {preview.skipped.slice(0, 8).map((line) => (
                <Text key={line.line} style={styles.skippedLine} numberOfLines={1}>
                  {line.text}
                </Text>
              ))}
              {preview.skipped.length > 8 ? <Text style={styles.skippedLine}>and {preview.skipped.length - 8} more</Text> : null}
            </View>
          ) : null}
          <View style={styles.save}>
            <Button title={chosen.size === 1 ? 'Add 1 holiday' : `Add ${chosen.size} holidays`} onPress={save} busy={busy === 'save'} disabled={chosen.size === 0} />
          </View>
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  paste: { minHeight: 160, fontSize: 14 },
  row: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  rowPressed: { backgroundColor: colors.surface },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxBlocked: { backgroundColor: colors.surface, borderColor: colors.surface },
  tick: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, color: colors.text, fontWeight: '500' },
  blockedText: { color: colors.muted },
  rowDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  problem: { fontSize: 13, color: colors.error, marginTop: 2 },
  warning: { fontSize: 13, color: tones.warn.text, marginTop: 2 },
  skipped: { marginTop: space.lg, padding: space.md, backgroundColor: colors.surface, borderRadius: 6 },
  skippedTitle: { fontSize: 13, color: colors.muted, marginBottom: space.xs },
  skippedLine: { fontSize: 13, color: colors.muted },
  save: { marginTop: space.xl },
});
