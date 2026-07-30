/**
 * Modal — bottom sheet / centered dialog wrapper.
 * Matches the web's dialog/confirm-popup pattern.
 */

import React from 'react';
import {
  View,
  Text,
  Modal as RNModal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
  ScrollView,
} from 'react-native';
import { X } from 'lucide-react-native';
import { Colors, Radius, Typography, Spacing, Shadows } from '@/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  /** Prevent closing by tapping backdrop */
  dismissible?: boolean;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  style,
  dismissible = true,
}: ModalProps) {
  const insets = useSafeAreaInsets();

  const maxHeight = size === 'sm' ? '40%' : size === 'md' ? '65%' : '90%';

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissible ? onClose : undefined}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={dismissible ? onClose : undefined}>
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(31,41,51,0.6)',
            }}
          />
        </TouchableWithoutFeedback>

        {/* Sheet */}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing[4] }}>
          <View
            style={[
              {
                backgroundColor: Colors.card,
                borderRadius: Radius.dialog,
                maxHeight,
                overflow: 'hidden',
                ...Shadows.xl,
              },
              style,
            ]}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: Spacing[5],
                paddingTop: Spacing[5],
                paddingBottom: Spacing[3],
                borderBottomWidth: 1,
                borderBottomColor: Colors.line,
              }}
            >
              <Text
                style={{
                  fontSize: Typography.fontSize.base,
                  fontWeight: Typography.fontWeight.semibold,
                  color: Colors.ink,
                  flex: 1,
                }}
              >
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <X size={20} color={Colors.slateText} />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView
              contentContainerStyle={{ padding: Spacing[5] }}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {/* Footer */}
            {footer && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: Spacing[2],
                  paddingHorizontal: Spacing[5],
                  paddingBottom: Spacing[5] + insets.bottom,
                  paddingTop: Spacing[3],
                  borderTopWidth: 1,
                  borderTopColor: Colors.line,
                }}
              >
                {footer}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

// ── Confirm dialog (named pop-up for reservations, etc.) ────────────────────

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
}: ConfirmModalProps) {
  const confirmBg = variant === 'danger' ? Colors.danger : Colors.teal;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(31,41,51,0.6)',
            justifyContent: 'center',
            paddingHorizontal: Spacing[6],
          }}
        >
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: Colors.card,
                borderRadius: Radius.dialog,
                padding: Spacing[5],
                ...Shadows.xl,
              }}
            >
              <Text
                style={{
                  fontSize: Typography.fontSize.base,
                  fontWeight: Typography.fontWeight.semibold,
                  color: Colors.ink,
                  marginBottom: Spacing[2],
                }}
              >
                {title}
              </Text>

              <Text
                style={{
                  fontSize: Typography.fontSize.sm,
                  color: Colors.slateText,
                  lineHeight: Typography.lineHeight.base,
                  marginBottom: Spacing[5],
                }}
              >
                {message}
              </Text>

              <View style={{ flexDirection: 'row', gap: Spacing[3] }}>
                {/* Cancel */}
                <TouchableOpacity
                  onPress={onCancel}
                  disabled={loading}
                  style={{
                    flex: 1,
                    paddingVertical: Spacing[2.5],
                    borderRadius: Radius.button,
                    borderWidth: 1,
                    borderColor: Colors.line,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: Typography.fontSize.sm,
                      fontWeight: Typography.fontWeight.medium,
                      color: Colors.ink,
                    }}
                  >
                    {cancelLabel}
                  </Text>
                </TouchableOpacity>

                {/* Confirm */}
                <TouchableOpacity
                  onPress={onConfirm}
                  disabled={loading}
                  style={{
                    flex: 1,
                    paddingVertical: Spacing[2.5],
                    borderRadius: Radius.button,
                    backgroundColor: loading ? confirmBg + '70' : confirmBg,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: Typography.fontSize.sm,
                      fontWeight: Typography.fontWeight.semibold,
                      color: Colors.white,
                    }}
                  >
                    {loading ? 'Please wait…' : confirmLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}
