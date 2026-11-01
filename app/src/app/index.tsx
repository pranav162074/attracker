import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../session.tsx';
import { Button } from '../ui/Button.tsx';
import { colors, space } from '../ui/theme.ts';

export default function Home() {
  const { state, logOut } = useSession();
  const [busy, setBusy] = useState(false);
  const email = state.status === 'signedIn' ? state.user.email : '';

  const onLogOut = async () => {
    setBusy(true);
    await logOut();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>attracker</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} role="heading">
          Your timetables
        </Text>
        <Text style={styles.muted}>Nothing here yet. Adding timetables comes next.</Text>
      </View>
      <View style={styles.account}>
        <Text style={styles.muted}>Logged in as</Text>
        <Text style={styles.email}>{email}</Text>
        <Button title="Log out" variant="secondary" onPress={onLogOut} busy={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: space.xl, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.surface },
  brand: { fontSize: 17, fontWeight: '700', color: colors.primary },
  body: { flex: 1, padding: space.xl },
  title: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: space.sm },
  muted: { fontSize: 15, color: colors.muted },
  account: { padding: space.xl, borderTopWidth: 1, borderTopColor: colors.surface, gap: space.sm },
  email: { fontSize: 16, color: colors.text, marginBottom: space.sm },
});
