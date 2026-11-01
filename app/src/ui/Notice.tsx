import { StyleSheet, Text, View } from 'react-native';
import { colors, space } from './theme.ts';

export const ErrorNotice = ({ message }: { message: string | null }) =>
  message ? (
    <View style={styles.box} role="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  ) : null;

const styles = StyleSheet.create({
  box: { backgroundColor: colors.errorBackground, borderRadius: 6, padding: space.md, marginBottom: space.lg },
  text: { color: colors.error, fontSize: 14 },
});
