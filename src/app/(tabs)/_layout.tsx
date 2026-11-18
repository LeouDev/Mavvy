import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, useColors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'car-sport-outline' },
  { name: 'loan', title: 'Loan', icon: 'wallet-outline' },
  { name: 'logs', title: 'Logs', icon: 'list-outline' },
  { name: 'photos', title: 'Photos', icon: 'images-outline' },
];

export default function TabsLayout() {
  const c = useColors();
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: c.page },
          tabBarStyle: { backgroundColor: c.page, borderTopColor: c.faint, borderTopWidth: 0.5 },
          tabBarActiveTintColor: c.onPage,
          tabBarInactiveTintColor: c.muted,
          tabBarLabelStyle: { fontFamily: fonts.mono, fontSize: 11, textTransform: 'uppercase' },
        }}>
        {TABS.map((t) => (
          <Tabs.Screen key={t.name} name={t.name}
            options={{ title: t.title, tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color as string} size={size - 2} /> }} />
        ))}
      </Tabs>
      {/* Page-coloured strip under the status bar so scrolled content doesn't run beneath the clock. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, backgroundColor: c.page }} />
    </View>
  );
}
