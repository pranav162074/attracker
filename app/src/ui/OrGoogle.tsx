import { Text, View } from 'react-native';
import { GoogleButton, googleAvailable } from './GoogleButton';
import { makeStyles, space } from './theme.ts';

type Props = { onToken: (idToken: string) => Promise<void>; onProblem: (message: string) => void };

export const OrGoogle = ({ onToken, onProblem }: Props) => {
  const styles = useStyles();
  if (!googleAvailable) return null;
  return (
    <View>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.or}>or</Text>
        <View style={styles.line} />
      </View>
      <GoogleButton onToken={onToken} onProblem={onProblem} />
    </View>
  );
};

const useStyles = makeStyles(({ colors }) => ({
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.muted, fontSize: 14 },
}));
