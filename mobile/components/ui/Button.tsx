/**
 * Button — primary, secondary, ghost, danger variants.
 * Matches the web app's button classes exactly.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { Colors, Radius, Typography, Spacing } from '@/constants';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize   = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

type StyleMap = {
  container: ViewStyle;
  text: TextStyle;
  disabledContainer: ViewStyle;
  disabledText: TextStyle;
};

const VARIANT_STYLES: Record<ButtonVariant, StyleMap> = {
  primary: {
    container:        { backgroundColor: Colors.teal, borderWidth: 0 },
    text:             { color: Colors.white },
    disabledContainer:{ backgroundColor: Colors.teal + '60' },
    disabledText:     { color: Colors.white + '80' },
  },
  secondary: {
    container:        { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
    text:             { color: Colors.ink },
    disabledContainer:{ backgroundColor: Colors.line },
    disabledText:     { color: Colors.slateText },
  },
  ghost: {
    container:        { backgroundColor: Colors.transparent, borderWidth: 0 },
    text:             { color: Colors.teal },
    disabledContainer:{ backgroundColor: Colors.transparent },
    disabledText:     { color: Colors.muted },
  },
  danger: {
    container:        { backgroundColor: Colors.danger, borderWidth: 0 },
    text:             { color: Colors.white },
    disabledContainer:{ backgroundColor: Colors.danger + '60' },
    disabledText:     { color: Colors.white + '80' },
  },
};

const SIZE_STYLES: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5], borderRadius: Radius.button },
    text:      { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium },
  },
  md: {
    container: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2.5], borderRadius: Radius.button },
    text:      { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold },
  },
  lg: {
    container: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3.5], borderRadius: Radius.button },
    text:      { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold },
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const variantStyles = VARIANT_STYLES[variant];
  const sizeStyles    = SIZE_STYLES[size];
  const isDisabled    = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing[2],
        },
        sizeStyles.container,
        isDisabled ? variantStyles.disabledContainer : variantStyles.container,
        fullWidth && { width: '100%' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' || variant === 'ghost' ? Colors.teal : Colors.white}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && <View>{icon}</View>}
          <Text
            style={[
              sizeStyles.text,
              isDisabled ? variantStyles.disabledText : variantStyles.text,
              textStyle,
            ]}
          >
            {label}
          </Text>
          {icon && iconPosition === 'right' && <View>{icon}</View>}
        </>
      )}
    </TouchableOpacity>
  );
}
