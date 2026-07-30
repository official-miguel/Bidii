import { Stack } from 'expo-router';

/**
 * Authentication flow layout — no tabs, just stack navigation
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
