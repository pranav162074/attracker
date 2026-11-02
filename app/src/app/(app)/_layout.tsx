import { Stack } from 'expo-router';
import { colors } from '../../ui/theme.ts';

export default function SignedInLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="timetables/new" options={{ title: 'New timetable' }} />
      <Stack.Screen name="timetables/[id]/index" options={{ title: 'Set up timetable' }} />
      <Stack.Screen name="timetables/[id]/details" options={{ title: 'Dates and rules' }} />
      <Stack.Screen name="timetables/[id]/grid" options={{ title: 'Weekly timetable' }} />
      <Stack.Screen name="timetables/[id]/subjects/index" options={{ title: 'Subjects' }} />
      <Stack.Screen name="timetables/[id]/subjects/[subjectId]" options={{ title: 'Subject' }} />
    </Stack>
  );
}
