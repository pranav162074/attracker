import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from './theme.ts';

export const WAKING_TITLE = 'Waking up the server…';
export const WAKING_BODY = 'attracker sleeps when nobody has used it for a while. This can take up to a minute.';

export const WakingBar = () => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.sm }]} role="status" pointerEvents="none">
      <ActivityIndicator size="small" color={colors.primary} />
      <View style={styles.words}>
        <Text style={styles.title}>{WAKING_TITLE}</Text>
        <Text style={styles.body}>{WAKING_BODY}</Text>
      </View>
    </View>
  );
};

export const WakingScreen = () => (
  <View style={styles.screen} role="status">
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={[styles.title, styles.centred]}>{WAKING_TITLE}</Text>
    <Text style={[styles.body, styles.centred]}>{WAKING_BODY}</Text>
  </View>
);

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    backgroundColor: colors.infoBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  words: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontSize: 13, color: colors.muted, lineHeight: 18, marginTop: 2 },
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  centred: { textAlign: 'center', maxWidth: 360 },
});
