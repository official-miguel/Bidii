import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';

/**
 * Splash / routing screen — determines where to send the user:
 *   • Not authenticated → /(auth)/login
 *   • Authenticated → /(tabs) (tabs layout handles role-based screens)
 */
export default function IndexScreen() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/(auth)/login');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, router]);

  return (
    <View className="flex-1 items-center justify-center bg-teal">
      <Text className="text-white text-3xl font-bold mb-4">Bidii Library</Text>
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text className="text-white/70 text-sm mt-4">Loading...</Text>
    </View>
  );
}
