import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon } from '../../../ui/TabIcon.tsx';
import { colors } from '../../../ui/theme.ts';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, height: 64 + insets.bottom, paddingTop: 4, paddingBottom: insets.bottom + 4 },
        tabBarItemStyle: { height: 56 },
        tabBarLabelStyle: { fontSize: 12 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ color }) => <TabIcon name="today" colour={color} /> }} />
      <Tabs.Screen name="subjects" options={{ title: 'Subjects', tabBarIcon: ({ color }) => <TabIcon name="subjects" colour={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: ({ color }) => <TabIcon name="calendar" colour={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon name="settings" colour={color} /> }} />
    </Tabs>
  );
}
