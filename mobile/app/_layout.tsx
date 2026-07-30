import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { api } from '@/services';
import { database } from '@/database';
import '../global.css';

/**
 * Root layout — initialises auth, API, and database before any screen renders.
 */
export default function RootLayout() {
  const { init } = useAuth();

  useEffect(() => {
    (async () => {
      // Restore saved auth token into API client
      await init();
      // Initialise API (token already set by init)
      await api.init();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
