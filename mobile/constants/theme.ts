/**
 * Bidii Mobile Design Tokens
 *
 * These constants mirror the web app's tailwind.config.ts and globals.css
 * exactly, ensuring the mobile Library module is visually indistinguishable
 * from the rest of the Bidii system.
 *
 * Usage:
 *   import { Colors, Typography, Spacing, Radius, Shadows } from '@/constants/theme';
 *   // For NativeWind className strings, use tailwind tokens directly.
 *   // These constants are for imperative StyleSheet / inline style usage.
 */

// ── Colors ──────────────────────────────────────────────────────────────────

export const Colors = {
  // Primary brand
  teal:       '#2C7F7E',
  tealLight:  '#3A9998',
  tealDark:   '#1F5C5B',
  teal50:     '#EDF7F7',
  teal100:    '#D0EDED',
  teal900:    '#0D3333',

  // Surfaces
  paper:      '#FAFBFC',
  card:       '#FFFFFF',
  line:       '#E8EDF2',

  // Text
  ink:        '#1F2933',
  inkLight:   '#2D3D4D',
  slateText:  '#667085',
  muted:      '#98A2B3',

  // Semantic
  danger:     '#F04438',
  dangerBg:   '#FEF3F2',
  success:    '#17B26A',
  successBg:  '#ECFDF3',
  warn:       '#F79009',
  warnBg:     '#FFFAEB',
  info:       '#2E90FA',
  infoBg:     '#EFF8FF',

  // Dark mode surfaces
  darkBg:      '#0D1B2A',
  darkSurface: '#162233',
  darkBorder:  '#1E3347',
  darkText:    '#E8EDF2',
  darkMuted:   '#667085',

  // Utility
  white:       '#FFFFFF',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof Colors;

// ── Typography ───────────────────────────────────────────────────────────────

export const Typography = {
  fontFamily: {
    sans:    'Inter',
    display: 'Inter',
  },
  fontSize: {
    xs:   12,   // 0.75rem
    sm:   14,   // 0.875rem
    base: 16,   // 1rem
    lg:   18,   // 1.125rem
    xl:   20,   // 1.25rem
    '2xl':24,   // 1.5rem
    '3xl':30,   // 1.875rem
    '4xl':36,   // 2.25rem
  },
  lineHeight: {
    xs:   16,   // 1rem
    sm:   20,   // 1.25rem
    base: 24,   // 1.5rem
    lg:   28,   // 1.75rem
    xl:   28,   // 1.75rem
    '2xl':32,   // 2rem
    '3xl':36,   // 2.25rem
    '4xl':40,   // 2.5rem
  },
  fontWeight: {
    normal:   '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
} as const;

// ── Spacing ──────────────────────────────────────────────────────────────────

export const Spacing = {
  0.5:  2,
  1:    4,
  1.5:  6,
  2:    8,
  2.5:  10,
  3:    12,
  3.5:  14,
  4:    16,
  4.5:  18,
  5:    20,
  6:    24,
  7:    28,
  8:    32,
  9:    36,
  10:   40,
  11:   44,   // min tap target
  12:   48,
  14:   56,
  16:   64,
  20:   80,
  24:   96,
} as const;

// ── Border Radius ────────────────────────────────────────────────────────────

export const Radius = {
  none:  0,
  sm:    6,
  md:    8,   // default
  button:10,  // buttons & inputs
  card:  12,  // cards
  dialog:16,  // dialogs / modals
  xl:    20,
  full:  9999,
} as const;

// ── Shadows (Platform-specific) ──────────────────────────────────────────────
// React Native requires explicit platform shadows (iOS / Android elevation).
// Values approximate the web shadow scale from globals.css.

import { Platform } from 'react-native';

const _iosShadow = (opacity: number, radius: number, offsetY: number) => ({
  shadowColor: '#1F2933',
  shadowOffset: { width: 0, height: offsetY },
  shadowOpacity: opacity,
  shadowRadius: radius,
}) as const;

export const Shadows = {
  xs: Platform.select({
    ios:     _iosShadow(0.05, 2, 1),
    android: { elevation: 2 },
    default: {},
  })!,
  sm: Platform.select({
    ios:     _iosShadow(0.08, 3, 2),
    android: { elevation: 4 },
    default: {},
  })!,
  DEFAULT: Platform.select({
    ios:     _iosShadow(0.08, 8, 3),
    android: { elevation: 6 },
    default: {},
  })!,
  md: Platform.select({
    ios:     _iosShadow(0.10, 12, 5),
    android: { elevation: 8 },
    default: {},
  })!,
  lg: Platform.select({
    ios:     _iosShadow(0.10, 24, 8),
    android: { elevation: 12 },
    default: {},
  })!,
  xl: Platform.select({
    ios:     _iosShadow(0.12, 40, 12),
    android: { elevation: 16 },
    default: {},
  })!,
} as const;

// ── Animation ────────────────────────────────────────────────────────────────

export const Animation = {
  duration: {
    fast:    100,
    default: 150,
    slow:    300,
  },
  easing: {
    // These correspond to the cubic-bezier values in globals.css
    default: [0.4, 0, 0.2, 1] as [number, number, number, number],
    spring:  [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  },
} as const;

// ── Library-specific status colour maps ─────────────────────────────────────
// Shared between card components, badges, and list items.

export const CardStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  ACTIVE:      { bg: Colors.successBg, text: Colors.success,  border: Colors.success },
  SUSPENDED:   { bg: Colors.warnBg,    text: Colors.warn,     border: Colors.warn },
  ALUMNI:      { bg: Colors.infoBg,    text: Colors.info,     border: Colors.info },
  TRANSFERRED: { bg: Colors.teal50,    text: Colors.teal,     border: Colors.teal },
  EXPIRED:     { bg: Colors.dangerBg,  text: Colors.danger,   border: Colors.danger },
};

export const CopyStatusColors: Record<string, { bg: string; text: string }> = {
  AVAILABLE:    { bg: Colors.successBg, text: Colors.success },
  BORROWED:     { bg: Colors.infoBg,    text: Colors.info },
  RESERVED:     { bg: Colors.warnBg,    text: Colors.warn },
  UNDER_REPAIR: { bg: Colors.warnBg,    text: Colors.warn },
  ARCHIVED:     { bg: Colors.line,      text: Colors.slateText },
  LOST:         { bg: Colors.dangerBg,  text: Colors.danger },
};

export const ConditionColors: Record<string, { bg: string; text: string }> = {
  EXCELLENT: { bg: Colors.successBg, text: Colors.success },
  GOOD:      { bg: Colors.successBg, text: Colors.success },
  FAIR:      { bg: Colors.warnBg,    text: Colors.warn },
  DAMAGED:   { bg: Colors.dangerBg,  text: Colors.danger },
  LOST:      { bg: Colors.dangerBg,  text: Colors.danger },
};

// ── Hit-slop for tap targets (min 44px per Apple/Google guidelines) ──────────

export const HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;

// ── Z-index stack ────────────────────────────────────────────────────────────

export const ZIndex = {
  base:    0,
  raised:  10,
  overlay: 20,
  modal:   30,
  toast:   40,
} as const;
