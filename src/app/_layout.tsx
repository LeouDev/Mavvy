import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { ShareTechMono_400Regular } from '@expo-google-fonts/share-tech-mono';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { migrate } from '@/db/schema';
import { syncReminders } from '@/lib/reminders';
import { useColors } from '@/theme';

// Keep the logo splash up until fonts are ready, so there's no blank flash before the first screen.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

// Module-level so its identity is stable: SQLiteProvider must not re-init (and close the DB) on re-render.
async function initDb(db: SQLiteDatabase) {
  await migrate(db);
  syncReminders(db); // re-schedule on every app start; never throws
}

export default function RootLayout() {
  const c = useColors();
  const [loaded, fontError] = useFonts({ ShareTechMono_400Regular, Inter_400Regular, Inter_500Medium });
  const ready = loaded || !!fontError; // a font failure falls back to system fonts rather than a stuck splash
  useEffect(() => { if (ready) SplashScreen.hide(); }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.page }} />;
  return (
    <SQLiteProvider databaseName="mavvy.db" onInit={initDb}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="car" options={{ presentation: 'modal' }} />
        <Stack.Screen name="loan-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="payment" options={{ presentation: 'modal' }} />
        <Stack.Screen name="fuel" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pms" options={{ presentation: 'modal' }} />
        <Stack.Screen name="mod" options={{ presentation: 'modal' }} />
        <Stack.Screen name="photo/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </SQLiteProvider>
  );
}
