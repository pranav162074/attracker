import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../session.tsx';
import { Button } from '../ui/Button.tsx';
import { colors, space } from '../ui/theme.ts';

export const Unreachable = ({ message }: { message: string }) => {
  const { retry } = useSession();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.column}>
        <Text style={styles.title} role="heading">
          Can't connect
        </Text>
        <Text style={styles.message}>{message}</Text>
        <Button title="Try again" onPress={retry} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: space.xl },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: space.sm },
  message: { fontSize: 15, color: colors.muted, marginBottom: space.xl, lineHeight: 21 },
});
