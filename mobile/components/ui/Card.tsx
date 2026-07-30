/**
 * Card — white card surface with border and optional shadow.
 * Matches web's `bg-card border border-line rounded-xl` pattern.
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors, Radius, Shadows, Spacing } from '@/constants';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number | 'none';
  shadow?: boolean;
  borderless?: boolean;
}

export function Card({
  children,
  style,
  padding = Spacing[4],
  shadow = false,
  borderless = false,
}: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: Colors.card,
          borderRadius: Radius.card,
          padding: padding === 'none' ? 0 : (typeof padding === 'number' ? padding : Spacing[4]),
          ...(borderless ? {} : { borderWidth: 1, borderColor: Colors.line }),
          ...(shadow ? Shadows.sm : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
