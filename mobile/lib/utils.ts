/**
 * Utility functions — formatting, validation, helpers
 */

import { format, differenceInDays, isWeekend } from 'date-fns';
import { CURRENCY_SYMBOL, DATE_FORMAT, DATETIME_FORMAT } from '@/constants';

// ── Date/Time formatting ───────────────────────────────────────────────────────

export function formatDate(date: Date | string | number): string {
  return format(new Date(date), DATE_FORMAT);
}

export function formatDateTime(date: Date | string | number): string {
  return format(new Date(date), DATETIME_FORMAT);
}

export function formatRelativeDate(date: Date | string | number): string {
  const daysDiff = differenceInDays(new Date(), new Date(date));
  
  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Yesterday';
  if (daysDiff === -1) return 'Tomorrow';
  if (daysDiff > 0 && daysDiff <= 7) return `${daysDiff} days ago`;
  if (daysDiff < 0 && daysDiff >= -7) return `in ${Math.abs(daysDiff)} days`;
  
  return formatDate(date);
}

export function isOverdue(dueDate: Date | string | number): boolean {
  return new Date(dueDate) < new Date();
}

export function daysUntilDue(dueDate: Date | string | number): number {
  return differenceInDays(new Date(dueDate), new Date());
}

export function daysOverdue(dueDate: Date | string | number): number {
  const days = differenceInDays(new Date(), new Date(dueDate));
  return days > 0 ? days : 0;
}

// ── Currency formatting ────────────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  if (amount === 0) return `${CURRENCY_SYMBOL} 0.00`;
  return `${CURRENCY_SYMBOL} ${amount.toFixed(2)}`;
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

// ── String utilities ───────────────────────────────────────────────────────────

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural || singular + 's'}`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function isValidISBN(isbn: string): boolean {
  const cleaned = isbn.replace(/[^0-9X]/gi, '');
  return cleaned.length === 10 || cleaned.length === 13;
}

export function sanitizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

// ── Array utilities ────────────────────────────────────────────────────────────

export function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string | number
): Record<string | number, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
    return result;
  }, {} as Record<string | number, T[]>);
}

export function sortBy<T>(
  array: T[],
  keyFn: (item: T) => string | number,
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  const sorted = [...array].sort((a, b) => {
    const aVal = keyFn(a);
    const bVal = keyFn(b);
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

export function unique<T>(array: T[], keyFn?: (item: T) => any): T[] {
  if (!keyFn) return [...new Set(array)];
  
  const seen = new Set();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Debounce ───────────────────────────────────────────────────────────────────

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ── QR Code utilities ──────────────────────────────────────────────────────────

export function parseQRCode(raw: string): { type: 'BOOK' | 'STUDENT' | 'LOAN'; id: string } | null {
  // Format: BIDII:BOOK:ACC-00123
  //         BIDII:STUDENT:ADM-2024-001
  //         BIDII:LOAN:loan-id-uuid
  
  if (!raw.startsWith('BIDII:')) return null;
  
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  
  const type = parts[1];
  const id = parts[2];
  
  if (type === 'BOOK' || type === 'STUDENT' || type === 'LOAN') {
    return { type, id };
  }
  
  return null;
}

export function generateBookQR(accessionNumber: string): string {
  return `BIDII:BOOK:${accessionNumber}`;
}

export function generateStudentQR(admissionNumber: string): string {
  return `BIDII:STUDENT:${admissionNumber}`;
}

export function generateLoanQR(borrowId: string): string {
  return `BIDII:LOAN:${borrowId}`;
}

// ── Status label helpers ───────────────────────────────────────────────────────

export function cardStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    ALUMNI: 'Alumni',
    TRANSFERRED: 'Transferred',
    EXPIRED: 'Expired',
  };
  return labels[status] || status;
}

export function copyStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    AVAILABLE: 'Available',
    BORROWED: 'Borrowed',
    RESERVED: 'Reserved',
    UNDER_REPAIR: 'Under Repair',
    ARCHIVED: 'Archived',
    LOST: 'Lost',
  };
  return labels[status] || status;
}

export function conditionLabel(condition: string): string {
  const labels: Record<string, string> = {
    EXCELLENT: 'Excellent',
    GOOD: 'Good',
    FAIR: 'Fair',
    DAMAGED: 'Damaged',
    LOST: 'Lost',
  };
  return labels[condition] || condition;
}

// ── Error handling ─────────────────────────────────────────────────────────────

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}
