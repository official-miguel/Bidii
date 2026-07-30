/**
 * Badge — inline status pill, mirrors web <Badge> component exactly.
 * Variants: success | warn | danger | info | default
 */

import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Colors, Radius, Typography } from '@/constants';

export type BadgeVariant = 'success' | 'warn' | 'danger' | 'info' | 'default';

const VARIANT_STYLES: Record<
  BadgeVariant,
  { bg: string; text: string; border: string }
> = {
  success: { bg: Colors.successBg, text: Colors.success,   border: Colors.success },
  warn:    { bg: Colors.warnBg,    text: Colors.warn,       border: Colors.warn },
  danger:  { bg: Colors.dangerBg,  text: Colors.danger,     border: Colors.danger },
  info:    { bg: Colors.infoBg,    text: Colors.info,       border: Colors.info },
  default: { bg: Colors.line,      text: Colors.slateText,  border: Colors.line },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Badge({ label, variant = 'default', size = 'md', style, textStyle }: BadgeProps) {
  const colors = VARIANT_STYLES[variant];
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        {
          backgroundColor: colors.bg,
          borderRadius: Radius.full,
          borderWidth: 1,
          borderColor: colors.border + '40', // 25% opacity border
          paddingHorizontal: isSmall ? 6 : 8,
          paddingVertical: isSmall ? 1 : 2,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text
        style={[
          {
            color: colors.text,
            fontSize: isSmall ? Typography.fontSize.xs : Typography.fontSize.xs,
            fontWeight: Typography.fontWeight.semibold,
          },
          textStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
