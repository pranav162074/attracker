import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../../session.tsx';
import { chooseSemester } from '../../../currentSemester.ts';
import { ApiError } from '../../../lib/api.ts';
import type { FieldErrors, SharedPreview } from '../../../lib/api.ts';
import { problemFrom } from '../../../lib/forms.ts';
import { setupPath } from '../../../lib/semester.ts';
import { checkCode, previewLines } from '../../../lib/share.ts';
import { Button } from '../../../ui/Button.tsx';
import { ErrorNotice } from '../../../ui/Notice.tsx';
import { Muted, Page } from '../../../ui/Page.tsx';
import { TextField } from '../../../ui/TextField.tsx';
import { colors, space } from '../../../ui/theme.ts';

export default function CopyTimetable() {
  const router = useRouter();
  const [codeText, setCodeText] = useState('');
  const [preview, setPreview] = useState<SharedPreview | null>(null);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (failure: unknown, field: 'code' | 'name') => {
    if (failure instanceof ApiError && (failure.code === 'unknown_code' || failure.code === 'validation_error' || failure.code === 'name_taken')) {
      setFields({ [failure.code === 'name_taken' ? 'name' : field]: failure.code === 'name_taken' ? 'You already have a semester with this name. Choose another.' : failure.message });
      return;
    }
    setMessage(problemFrom(failure).message);
  };

  const find = async () => {
    const { code, error } = checkCode(codeText);
    setFields(error ? { code: error } : {});
    setMessage(null);
    if (!code) return;
    setBusy(true);
    try {
      const found = await api.previewShared(code);
      setPreview(found);
      setName(found.name);
      setCodeText(code);
    } catch (failure) {
      fail(failure, 'code');
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!preview) return;
    if (!name.trim()) {
      setFields({ name: 'Give the semester a name' });
      return;
    }
    setBusy(true);
    setFields({});
    setMessage(null);
    try {
      const timetable = await api.copyShared(preview.code, name.trim());
      await chooseSemester(timetable.id);
      router.replace(`${setupPath(timetable.id, 'subjects')}&copied=1`);
    } catch (failure) {
      fail(failure, 'name');
      setBusy(false);
    }
  };

  return (
    <Page>
      <Text style={styles.title} role="heading">
        Copy a classmate’s timetable
      </Text>
      <Muted>Ask a classmate for their share code. It is under Settings, Share with classmates. You get your own copy of their subjects, weekly timetable and holidays to change as you like.</Muted>
      <ErrorNotice message={message} />
      <TextField
        label="Share code"
        value={codeText}
        onChangeText={(text) => {
          setCodeText(text);
          if (preview) setPreview(null);
        }}
        error={fields.code}
        placeholder="7K3P-Q9M2"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        returnKeyType="search"
        onSubmitEditing={find}
      />
      {!preview ? <Button title="Find timetable" onPress={find} busy={busy} /> : null}
      {preview ? (
        <View style={styles.preview}>
          <Text style={styles.previewName}>{preview.name}</Text>
          {previewLines(preview).map((line) => (
            <Text key={line} style={styles.previewLine}>
              {line}
            </Text>
          ))}
          <Text style={styles.subjects}>{preview.subjects.map((subject) => subject.name).join(' · ')}</Text>
        </View>
      ) : null}
      {preview ? (
        <>
          <TextField label="Name for your copy" value={name} onChangeText={setName} error={fields.name} maxLength={60} />
          <Button title="Copy and review" onPress={copy} busy={busy} />
          <Muted>Next you can change anything that is different for you, like your open elective, before you start tracking.</Muted>
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: space.md },
  preview: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, marginBottom: space.lg, gap: space.xs },
  previewName: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  previewLine: { fontSize: 14, color: colors.text },
  subjects: { fontSize: 13, color: colors.muted, marginTop: space.sm, lineHeight: 18 },
});
