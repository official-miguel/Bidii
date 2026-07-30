/**
 * ScreenHeader — teal top bar that sits above SafeArea, with optional back button.
 * Consistent across all screens.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle, StatusBar, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Colors, Typography, Spacing } from '@/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: ViewStyle;
  /** Override background colour — defaults to teal */
  color?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  right,
  style,
  color,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bgColor = color || Colors.teal;

  const handleBack = onBack || (() => router.back());

  return (
    <View
      style={[
        {
          backgroundColor: bgColor,
          paddingTop: insets.top + Spacing[3],
          paddingBottom: Spacing[5],
          paddingHorizontal: Spacing[6],
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Left: back button or spacer */}
        {showBack ? (
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ marginRight: Spacing[2] }}
          >
            <ChevronLeft size={24} color={Colors.white} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 + Spacing[2] }} />
        )}

        {/* Center: title */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: Colors.white,
              fontSize: Typography.fontSize.xl,
              fontWeight: Typography.fontWeight.bold,
              textAlign: showBack ? 'center' : 'left',
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                color: Colors.white + 'CC',
                fontSize: Typography.fontSize.sm,
                marginTop: 2,
                textAlign: showBack ? 'center' : 'left',
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right: actions or spacer */}
        {right ? (
          <View style={{ marginLeft: Spacing[2] }}>{right}</View>
        ) : (
          <View style={{ width: showBack ? 24 + Spacing[2] : 0 }} />
        )}
      </View>
    </View>
  );
}
