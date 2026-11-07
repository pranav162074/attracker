import { StyleSheet, Text, View } from 'react-native';
import type { CatchUp } from '../lib/catchUp.ts';
import { catchUpText } from '../lib/catchUp.ts';
import { Button } from '../ui/Button.tsx';
import { colors, space, tones } from '../ui/theme.ts';

type Props = {
  catchUp: CatchUp;
  withClasses: number | null;
  onMark: () => void;
  onOfficial: () => void;
  onDone: () => void;
};

export const CatchUpNotice = ({ catchUp, withClasses, onMark, onOfficial, onDone }: Props) => {
  const text = catchUpText(catchUp, withClasses);
  return (
    <View style={styles.box} role="region" aria-label={text.title}>
      <Text style={styles.title}>{text.title}</Text>
      <Text style={styles.body}>{text.body}</Text>
      <View style={styles.actions}>
        {catchUp.kind === 'late' ? <Button title="Add college attendance" onPress={onOfficial} /> : null}
        <Button title={catchUp.kind === 'gap' ? 'Mark these days' : 'Mark days I missed'} variant={catchUp.kind === 'late' ? 'secondary' : 'primary'} onPress={onMark} />
        <Button title={catchUp.kind === 'gap' ? 'Done, all checked' : 'Not needed'} variant="secondary" onPress={onDone} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { backgroundColor: tones.warn.background, borderRadius: 8, padding: space.lg, marginBottom: space.lg },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  actions: { gap: space.sm, marginTop: space.md },
});
