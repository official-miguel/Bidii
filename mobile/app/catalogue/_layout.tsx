import { Stack } from 'expo-router';

export default function CatalogueLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="new" />
      <Stack.Screen name="import" />
      <Stack.Screen name="[id]/copy/new" />
      <Stack.Screen name="[id]/copy/[copyId]" />
    </Stack>
  );
}
