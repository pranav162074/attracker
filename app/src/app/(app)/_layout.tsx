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
      <Stack.Screen name="timetables/[id]/index" options={{ title: 'Timetable' }} />
      <Stack.Screen name="timetables/[id]/details" options={{ title: 'Dates and rules' }} />
      <Stack.Screen name="timetables/[id]/subject/[subjectId]" options={{ title: 'Subject' }} />
      <Stack.Screen name="timetables/[id]/official/index" options={{ title: 'Official numbers' }} />
      <Stack.Screen name="timetables/[id]/official/new" options={{ title: 'Type in official numbers' }} />
      <Stack.Screen name="timetables/[id]/official/sheet" options={{ title: 'Read the class sheet' }} />
      <Stack.Screen name="timetables/[id]/official/overall" options={{ title: 'Overall percentage' }} />
      <Stack.Screen name="timetables/[id]/month" options={{ title: 'Month' }} />
      <Stack.Screen name="timetables/[id]/days/[date]" options={{ title: 'Day' }} />
      <Stack.Screen name="timetables/[id]/grid" options={{ title: 'Weekly timetable' }} />
      <Stack.Screen name="timetables/[id]/subjects/index" options={{ title: 'Subjects' }} />
      <Stack.Screen name="timetables/[id]/calendar/index" options={{ title: 'Holidays and special days' }} />
      <Stack.Screen name="timetables/[id]/calendar/import" options={{ title: 'Paste holidays' }} />
      <Stack.Screen name="timetables/[id]/calendar/[dayId]" options={{ title: 'Day' }} />
      <Stack.Screen name="timetables/[id]/subjects/[subjectId]" options={{ title: 'Subject' }} />
    </Stack>
  );
}
