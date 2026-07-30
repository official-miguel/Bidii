/**
 * Toast — lightweight in-app notification, auto-dismisses.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, ViewStyle } from 'react-native';
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react-native';
import { Colors, Radius, Typography, Spacing, Shadows } from '@/constants';

export type ToastVariant = 'success' | 'error' | 'info' | 'warn';

interface ToastProps {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onHide?: () => void;
  style?: ViewStyle;
}

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 size={18} color={Colors.success} />,
  error:   <AlertCircle  size={18} color={Colors.danger} />,
  info:    <Info         size={18} color={Colors.info} />,
  warn:    <AlertTriangle size={18} color={Colors.warn} />,
};

const BG_COLORS: Record<ToastVariant, { bg: string; border: string }> = {
  success: { bg: Colors.successBg, border: Colors.success + '40' },
  error:   { bg: Colors.dangerBg,  border: Colors.danger  + '40' },
  info:    { bg: Colors.infoBg,    border: Colors.info    + '40' },
  warn:    { bg: Colors.warnBg,    border: Colors.warn    + '40' },
};

export function Toast({
  visible,
  message,
  variant = 'success',
  duration = 3000,
  onHide,
  style,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(duration),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => onHide?.());
    }
  }, [visible, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const colors = BG_COLORS[variant];

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: Spacing[12],
          left: Spacing[4],
          right: Spacing[4],
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing[3],
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.card,
          paddingHorizontal: Spacing[4],
          paddingVertical: Spacing[3],
          opacity,
          ...Shadows.md,
        },
        style,
      ]}
    >
      {ICONS[variant]}
      <Text
        style={{
          flex: 1,
          fontSize: Typography.fontSize.sm,
          color: Colors.ink,
        }}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

// ── useToast hook ─────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';

interface ToastState {
  visible: boolean;
  message: string;
  variant: ToastVariant;
}

export function useToast() {
  const [state, setState] = useState<ToastState>({
    visible: false,
    message: '',
    variant: 'success',
  });

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    setState({ visible: true, message, variant });
  }, []);

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const toastProps = { ...state, onHide: hide };

  return { show, hide, toastProps };
}
