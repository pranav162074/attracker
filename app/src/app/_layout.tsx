import { useEffect } from 'react';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../session.tsx';
import { Unreachable } from '../screens/Unreachable.tsx';

SplashScreen.preventAutoHideAsync().catch(() => {});

const RootNavigator = () => {
  const { state } = useSession();
  const loading = state.status === 'loading';
  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);
  if (loading) return null;
  if (state.status === 'unreachable') return <Unreachable message={state.message} />;
  const signedIn = state.status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
    </Stack>
  );
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
