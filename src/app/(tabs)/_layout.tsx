import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
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
  return (
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
  );
}
