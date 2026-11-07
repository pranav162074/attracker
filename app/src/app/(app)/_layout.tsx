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
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'attracker' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
      <Stack.Screen name="timetables/new" options={{ title: 'New semester' }} />
      <Stack.Screen name="timetables/[id]/index" options={{ title: 'Semester' }} />
      <Stack.Screen name="timetables/[id]/details" options={{ title: 'Semester' }} />
      <Stack.Screen name="timetables/[id]/started" options={{ title: 'New semester' }} />
      <Stack.Screen name="timetables/[id]/subject/[subjectId]" options={{ title: 'Subject' }} />
      <Stack.Screen name="timetables/[id]/official/index" options={{ title: 'Attendance from college' }} />
      <Stack.Screen name="timetables/[id]/official/new" options={{ title: 'Type in per subject' }} />
      <Stack.Screen name="timetables/[id]/official/sheet" options={{ title: 'From the attendance sheet' }} />
      <Stack.Screen name="timetables/[id]/official/overall" options={{ title: 'Overall percentage' }} />
      <Stack.Screen name="timetables/[id]/month" options={{ title: 'Calendar' }} />
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
