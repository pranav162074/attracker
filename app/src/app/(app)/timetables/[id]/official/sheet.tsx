import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../../../../session.tsx';
import type { SheetPreview } from '../../../../../lib/api.ts';
import { problemFrom } from '../../../../../lib/forms.ts';
import { formFromPreview, truncatedPercent, unusedSheetSubjects } from '../../../../../lib/official.ts';
import { prefs } from '../../../../../prefs';
import { OfficialEditor } from '../../../../../screens/OfficialEditor.tsx';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { ErrorNotice } from '../../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Muted, Page, SectionTitle } from '../../../../../ui/Page.tsx';
import { TextField } from '../../../../../ui/TextField.tsx';
import { colors, space, tones } from '../../../../../ui/theme.ts';

const SHEET_TYPES = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'];
const MAX_BYTES = 2 * 1024 * 1024;

const loadAll = async (id: number) => {
  const [timetable, subjects] = await Promise.all([api.timetable(id), api.subjects(id, true)]);
  return { timetable, subjects };
};

const readFile = async (asset: DocumentPicker.DocumentPickerAsset): Promise<Blob | ArrayBuffer> => {
  if (asset.file) return asset.file;
  const response = await fetch(asset.uri);
  return response.arrayBuffer();
};

const Found = ({ preview, names }: { preview: SheetPreview; names: Map<number, string> }) => {
  const unused = unusedSheetSubjects(preview);
  const percent = preview.totals.held !== null && preview.totals.attended !== null ? truncatedPercent(preview.totals.attended, preview.totals.held) : null;
  return (
    <View style={styles.found}>
      <Text style={styles.foundTitle}>Found {preview.registration} in the sheet</Text>
      {preview.totals.held !== null ? (
        <Text style={styles.foundLine}>
          Sheet total: {preview.totals.attended} of {preview.totals.held} attended{percent ? `, ${percent}` : ''}
        </Text>
      ) : null}
      {preview.subjects
        .filter((entry) => entry.subjectId !== null)
        .map((entry) => (
          <Text key={`${entry.code}-${entry.name}`} style={styles.foundLine}>
            {entry.code ? `${entry.code} ` : ''}
            {entry.name} → {names.get(entry.subjectId!) ?? 'subject'}
          </Text>
        ))}
      {unused.length > 0 ? (
        <Text style={styles.warn}>
          Not matched to any of your subjects, so not used: {unused.map((entry) => `${entry.name} (${entry.attended} of ${entry.held})`).join(', ')}. If one of them is yours, rename your subject to match and read the sheet again.
        </Text>
      ) : null}
      {preview.unmatchedSubjects.length > 0 ? (
        <Text style={styles.warn}>Not found in the sheet: {preview.unmatchedSubjects.map((subject) => subject.name).join(', ')}. Fill in their numbers yourself below.</Text>
      ) : null}
    </View>
  );
};

export default function ReadSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => loadAll(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  const [registration, setRegistration] = useState('');
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    prefs.read('registration').then((saved) => {
      if (active && saved) setRegistration((current) => current || saved);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const pick = async () => {
    const wanted = registration.trim();
    setMessage(null);
    if (!/^[A-Za-z0-9-]{3,30}$/.test(wanted)) {
      setFieldError('Enter your registration number, as it appears in the sheet');
      return;
    }
    setFieldError(undefined);
    const result = await DocumentPicker.getDocumentAsync({ type: SHEET_TYPES, copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (asset.size !== undefined && asset.size > MAX_BYTES) {
      setMessage('That file is larger than 2 MB. Use the sheet as the college shared it.');
      return;
    }
    setBusy(true);
    try {
      const found = await api.readSheet(timetableId, wanted, await readFile(asset));
      prefs.save('registration', wanted);
      setPreview(found);
    } catch (failure) {
      setMessage(problemFrom(failure).message);
    }
    setBusy(false);
  };

  const names = new Map(data.subjects.map((subject) => [subject.id, subject.name]));

  if (preview) {
    return (
      <Page>
        <OfficialEditor timetable={data.timetable} subjects={data.subjects} initial={formFromPreview(preview, data.subjects)} source="sheet">
          <Found preview={preview} names={names} />
          <Muted>Check the numbers below against the sheet, choose the date it covers, and save. Only your own row was read.</Muted>
        </OfficialEditor>
        <View style={styles.again}>
          <Button title="Use a different file" variant="secondary" onPress={() => setPreview(null)} />
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <Muted>Pick the attendance sheet the college shared (.xls or .xlsx). The app reads only the row with your registration number; nobody else’s numbers are kept.</Muted>
      <TextField
        label="Registration number"
        value={registration}
        onChangeText={setRegistration}
        error={fieldError}
        placeholder="324103311015"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={30}
      />
      <ErrorNotice message={message} />
      <Button title="Choose the sheet file" onPress={pick} busy={busy} />
      <SectionTitle>What the sheet needs</SectionTitle>
      <Muted>A column of registration numbers, and for each subject a pair of columns for classes held (H) and attended (A). A total column is used for hours that belong to no subject.</Muted>
    </Page>
  );
}

const styles = StyleSheet.create({
  found: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, marginBottom: space.md },
  foundTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  foundLine: { fontSize: 13, color: colors.muted, marginTop: 2 },
  warn: { fontSize: 13, color: tones.warn.text, marginTop: space.sm, lineHeight: 18 },
  again: { marginTop: space.md },
});
