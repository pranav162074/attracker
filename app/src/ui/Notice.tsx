import { Text, View } from 'react-native';
import { makeStyles, space } from './theme.ts';

export const ErrorNotice = ({ message }: { message: string | null }) => {
  const styles = useStyles();
  return message ? (
    <View style={styles.box} role="alert">
      <Text style={styles.text}>{message}</Text>
    </View>
  ) : null;
};

const useStyles = makeStyles(({ colors }) => ({
  box: { backgroundColor: colors.errorBackground, borderRadius: 6, padding: space.md, marginBottom: space.lg },
  text: { color: colors.error, fontSize: 14 },
}));
