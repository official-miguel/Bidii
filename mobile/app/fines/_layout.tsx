import { Stack } from 'expo-router';

export default function FinesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="stats" />
    </Stack>
  );
}
