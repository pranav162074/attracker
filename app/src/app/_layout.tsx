import { useEffect } from 'react';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../session.tsx';
import { Unreachable } from '../screens/Unreachable.tsx';
import { WakingBar, WakingScreen } from '../ui/WakingNotice.tsx';
import { useWaking } from '../waking.ts';

SplashScreen.preventAutoHideAsync().catch(() => {});

const RootNavigator = () => {
  const { state } = useSession();
  const waking = useWaking();
  const loading = state.status === 'loading';
  useEffect(() => {
    if (!loading || waking) SplashScreen.hide();
  }, [loading, waking]);
  if (loading) return waking ? <WakingScreen /> : null;
  if (state.status === 'unreachable') return <Unreachable message={state.message} />;
  const signedIn = state.status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn} redirectTo="/welcome">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="features" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="forgot" />
      </Stack.Protected>
    </Stack>
  );
};

const Waking = () => {
  const { state } = useSession();
  const waking = useWaking();
  return waking && state.status !== 'loading' ? <WakingBar /> : null;
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootNavigator />
        <Waking />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
