import { Stack } from 'expo-router';

export default function CardsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[studentId]" />
    </Stack>
  );
}
