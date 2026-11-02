import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, useSession } from '../../session.tsx';
import { problemFrom } from '../../lib/forms.ts';
import { Button } from '../../ui/Button.tsx';
import { ErrorNotice } from '../../ui/Notice.tsx';
import { colors, space } from '../../ui/theme.ts';

export default function Account() {
  const { state, logOut } = useSession();
  const [busy, setBusy] = useState<'here' | 'everywhere' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const email = state.status === 'signedIn' ? state.user.email : '';

  const here = async () => {
    setBusy('here');
    await logOut();
  };

  const everywhere = async () => {
    setBusy('everywhere');
    setMessage(null);
    try {
      await api.logoutAll();
      await logOut();
    } catch (error) {
      setMessage(problemFrom(error).message);
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.body}>
        <Text style={styles.label}>Logged in as</Text>
        <Text style={styles.email}>{email}</Text>
        <ErrorNotice message={message} />
        <View style={styles.actions}>
          <Button title="Log out" variant="secondary" onPress={here} busy={busy === 'here'} disabled={busy !== null} />
          <Button title="Log out on all devices" variant="secondary" onPress={everywhere} busy={busy === 'everywhere'} disabled={busy !== null} />
        </View>
        <Text style={styles.note}>Logging out on all devices also logs out this phone or browser.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  label: { fontSize: 14, color: colors.muted },
  email: { fontSize: 17, color: colors.text, marginTop: space.xs, marginBottom: space.xl },
  actions: { gap: space.md },
  note: { fontSize: 13, color: colors.muted, marginTop: space.md },
});
