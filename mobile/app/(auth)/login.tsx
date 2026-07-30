import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/lib/auth';
import { Colors } from '@/constants';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    try {
      clearError();
      await login(email.trim(), password);
      // Navigation happens automatically via index.tsx watching auth state
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Login Failed', err?.message || 'Invalid credentials');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-teal"
    >
      <StatusBar style="light" />
      
      <View className="flex-1 justify-center px-6">
        {/* Logo / Branding */}
        <View className="items-center mb-12">
          <Text className="text-white text-4xl font-bold mb-2">Bidii Library</Text>
          <Text className="text-white/80 text-base">School Management System</Text>
        </View>

        {/* Login Form */}
        <View className="bg-white rounded-xl p-6 shadow-lg">
          <Text className="text-ink text-xl font-semibold mb-6 text-center">
            Sign In
          </Text>

          {error && (
            <View className="bg-danger-bg border border-danger rounded-lg p-3 mb-4">
              <Text className="text-danger text-sm">{error}</Text>
            </View>
          )}

          {/* Email Input */}
          <View className="mb-4">
            <Text className="text-slate text-sm font-medium mb-2">Email</Text>
            <TextInput
              className="bg-paper border border-line rounded-lg px-4 py-3 text-base text-ink"
              placeholder="your.email@school.com"
              placeholderTextColor={Colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-slate text-sm font-medium mb-2">Password</Text>
            <TextInput
              className="bg-paper border border-line rounded-lg px-4 py-3 text-base text-ink"
              placeholder="••••••••"
              placeholderTextColor={Colors.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={isLoading}
            className={`rounded-lg py-4 items-center ${
              isLoading ? 'bg-teal/50' : 'bg-teal'
            }`}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white text-base font-semibold">
                Sign In
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text className="text-white/60 text-xs text-center mt-8">
          Bidii School Management System v1.0{'\n'}
          © 2026 — All rights reserved
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
