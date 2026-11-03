import { StyleSheet, Text, View } from 'react-native';
import { offlineNote } from '../lib/offline.ts';
import { colors, space, tones } from './theme.ts';

export const OfflineNotice = ({ savedAt, queued = 0 }: { savedAt: string | null; queued?: number }) => {
  if (!savedAt && queued === 0) return null;
  return (
    <View style={styles.box} role="status">
      {savedAt ? <Text style={styles.text}>{offlineNote(savedAt)} Pull down to try again.</Text> : null}
      {queued > 0 ? (
        <Text style={styles.text}>
          {queued === 1 ? '1 mark is' : `${queued} marks are`} saved on this device and will be sent when you are back online.
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { backgroundColor: tones.warn.background, borderRadius: 6, padding: space.md, marginBottom: space.lg, gap: space.xs },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
