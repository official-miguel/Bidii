/**
 * Input — text input matching web app's inputClass exactly.
 * Supports label, prefix icon, suffix icon, error state.
 */

import React, { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Colors, Radius, Typography, Spacing } from '@/constants';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  onSuffixPress?: () => void;
  containerStyle?: ViewStyle;
  required?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    prefixIcon,
    suffixIcon,
    onSuffixPress,
    containerStyle,
    required,
    style,
    ...rest
  },
  ref
) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? Colors.danger
    : focused
    ? Colors.teal
    : Colors.line;

  const ringColor = error
    ? Colors.danger + '30'
    : focused
    ? Colors.teal + '25'
    : Colors.transparent;

  return (
    <View style={containerStyle}>
      {/* Label */}
      {label && (
        <Text
          style={{
            fontSize: Typography.fontSize.sm,
            fontWeight: Typography.fontWeight.medium,
            color: Colors.ink,
            marginBottom: Spacing[1.5],
          }}
        >
          {label}
          {required && (
            <Text style={{ color: Colors.danger }}> *</Text>
          )}
        </Text>
      )}

      {/* Input wrapper */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          borderRadius: Radius.button,
          backgroundColor: Colors.paper,
          // Soft focus ring via shadow on iOS
          ...(focused && {
            shadowColor: ringColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 4,
            elevation: 2,
          }),
        }}
      >
        {/* Prefix icon */}
        {prefixIcon && (
          <View style={{ paddingLeft: Spacing[3], paddingRight: Spacing[1] }}>
            {prefixIcon}
          </View>
        )}

        {/* Text input */}
        <TextInput
          ref={ref}
          style={[
            {
              flex: 1,
              paddingHorizontal: prefixIcon ? Spacing[2] : Spacing[3],
              paddingVertical: Spacing[2.5],
              fontSize: Typography.fontSize.sm,
              color: Colors.ink,
              fontFamily: Typography.fontFamily.sans,
            },
            style,
          ]}
          placeholderTextColor={Colors.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />

        {/* Suffix icon / button */}
        {suffixIcon && (
          <TouchableOpacity
            onPress={onSuffixPress}
            disabled={!onSuffixPress}
            style={{ paddingRight: Spacing[3], paddingLeft: Spacing[1] }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            {suffixIcon}
          </TouchableOpacity>
        )}
      </View>

      {/* Error message */}
      {error && (
        <Text
          style={{
            fontSize: Typography.fontSize.xs,
            color: Colors.danger,
            marginTop: Spacing[1],
          }}
        >
          {error}
        </Text>
      )}

      {/* Hint text */}
      {hint && !error && (
        <Text
          style={{
            fontSize: Typography.fontSize.xs,
            color: Colors.slateText,
            marginTop: Spacing[1],
          }}
        >
          {hint}
        </Text>
      )}
    </View>
  );
});
