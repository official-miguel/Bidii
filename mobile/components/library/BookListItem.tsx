/**
 * BookListItem — catalogue/copy list row with status badge
 */

import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { ChevronRight, BookOpen } from 'lucide-react-native';
import { Colors, Radius, Typography, Spacing } from '@/constants';
import { Badge, type BadgeVariant } from '@/components/ui';
import { copyStatusLabel, conditionLabel } from '@/lib/utils';
import { CopyStatusColors, ConditionColors } from '@/constants/theme';

interface BookListItemProps {
  title: string;
  author?: string | null;
  accessionNumber?: string;
  status?: string;
  condition?: string;
  onPress: () => void;
  style?: ViewStyle;
  subtitle?: string;
  showChevron?: boolean;
}

export function BookListItem({
  title,
  author,
  accessionNumber,
  status,
  condition,
  onPress,
  style,
  subtitle,
  showChevron = true,
}: BookListItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing[3],
          backgroundColor: Colors.card,
          borderWidth: 1,
          borderColor: Colors.line,
          borderRadius: Radius.button,
          padding: Spacing[3],
        },
        style,
      ]}
    >
      {/* Icon */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: Radius.sm,
          backgroundColor: Colors.teal50,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BookOpen size={20} color={Colors.teal} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, gap: Spacing[1] }}>
        <Text
          style={{
            fontSize: Typography.fontSize.sm,
            fontWeight: Typography.fontWeight.semibold,
            color: Colors.ink,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>

        {(author || accessionNumber || subtitle) && (
          <Text
            style={{
              fontSize: Typography.fontSize.xs,
              color: Colors.slateText,
            }}
            numberOfLines={1}
          >
            {author && `by ${author}`}
            {author && accessionNumber && ' • '}
            {accessionNumber}
            {(author || accessionNumber) && subtitle && ' • '}
            {subtitle}
          </Text>
        )}

        {/* Badges row */}
        {(status || condition) && (
          <View style={{ flexDirection: 'row', gap: Spacing[1.5], marginTop: Spacing[1] }}>
            {status && (
              <View
                style={{
                  paddingHorizontal: Spacing[2],
                  paddingVertical: 1,
                  borderRadius: Radius.full,
                  backgroundColor: CopyStatusColors[status]?.bg || Colors.line,
                }}
              >
                <Text
                  style={{
                    fontSize: Typography.fontSize.xs,
                    fontWeight: Typography.fontWeight.semibold,
                    color: CopyStatusColors[status]?.text || Colors.slateText,
                  }}
                >
                  {copyStatusLabel(status)}
                </Text>
              </View>
            )}

            {condition && (
              <View
                style={{
                  paddingHorizontal: Spacing[2],
                  paddingVertical: 1,
                  borderRadius: Radius.full,
                  backgroundColor: ConditionColors[condition]?.bg || Colors.line,
                }}
              >
                <Text
                  style={{
                    fontSize: Typography.fontSize.xs,
                    fontWeight: Typography.fontWeight.semibold,
                    color: ConditionColors[condition]?.text || Colors.slateText,
                  }}
                >
                  {conditionLabel(condition)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Chevron */}
      {showChevron && <ChevronRight size={18} color={Colors.muted} />}
    </TouchableOpacity>
  );
}
