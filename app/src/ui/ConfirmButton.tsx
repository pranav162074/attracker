import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button.tsx';
import { colors, space } from './theme.ts';

type Props = {
  title: string;
  question: string;
  confirmTitle: string;
  onConfirm: () => Promise<void> | void;
};

export const ConfirmButton = ({ title, question, confirmTitle, onConfirm }: Props) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) return <Button title={title} variant="secondary" onPress={() => setAsking(true)} />;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.question}>{question}</Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title="Cancel" variant="secondary" onPress={() => setAsking(false)} disabled={busy} />
        </View>
        <View style={styles.action}>
          <Button title={confirmTitle} variant="danger" onPress={confirm} busy={busy} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.error, borderRadius: 8, padding: space.lg, backgroundColor: colors.errorBackground },
  question: { fontSize: 15, color: colors.text, lineHeight: 21, marginBottom: space.md },
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1 },
});
