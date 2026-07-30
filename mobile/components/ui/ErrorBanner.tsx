/**
 * ErrorBanner — dismissible inline error display.
 * Matches web ErrorBanner component.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { AlertCircle, X } from 'lucide-react-native';
import { Colors, Radius, Typography, Spacing } from '@/constants';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  style?: ViewStyle;
}

export function ErrorBanner({ message, onDismiss, style }: ErrorBannerProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: Spacing[2],
          backgroundColor: Colors.dangerBg,
          borderWidth: 1,
          borderColor: Colors.danger + '30',
          borderRadius: Radius.button,
          padding: Spacing[3],
        },
        style,
      ]}
    >
      <AlertCircle size={16} color={Colors.danger} style={{ marginTop: 1 }} />

      <Text
        style={{
          flex: 1,
          fontSize: Typography.fontSize.sm,
          color: Colors.danger,
        }}
      >
        {message}
      </Text>

      {onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <X size={14} color={Colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}
