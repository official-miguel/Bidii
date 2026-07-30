/**
 * Shared TypeScript type definitions
 */

// Re-export API types for convenience
export type {
  AuthUser,
  StudentHit,
  CardDetail,
  BorrowRow,
  CatalogueRecord,
  CatalogueWithCopies,
  CatalogueListResult,
  CreateCatalogueInput,
  CopyRecord,
  CreateCopyInput,
  PolicyEvalResult,
  BorrowInput,
  BorrowResult,
  ReturnInput,
  ReturnResult,
  RenewResult,
  ReservationRecord,
  CreateReservationInput,
  OverdueListResult,
  OverdueItem,
  LibrarySettingsRecord,
  LibraryPolicyRecord,
  LibraryAnalytics,
} from '@/services/api';

// ── Library-specific enums ────────────────────────────────────────────────────

export enum LibraryCardStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ALUMNI = 'ALUMNI',
  TRANSFERRED = 'TRANSFERRED',
  EXPIRED = 'EXPIRED',
}

export enum CopyStatus {
  AVAILABLE = 'AVAILABLE',
  BORROWED = 'BORROWED',
  RESERVED = 'RESERVED',
  UNDER_REPAIR = 'UNDER_REPAIR',
  ARCHIVED = 'ARCHIVED',
  LOST = 'LOST',
}

export enum CopyCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  DAMAGED = 'DAMAGED',
  LOST = 'LOST',
}

export enum ReservationType {
  INDIVIDUAL = 'INDIVIDUAL',
  CLASSROOM = 'CLASSROOM',
  DEPARTMENT = 'DEPARTMENT',
  WAITLIST = 'WAITLIST',
}

export enum ReservationStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum ReturnType {
  NORMAL = 'NORMAL',
  DAMAGED = 'DAMAGED',
  LOST = 'LOST',
  REPLACEMENT_RECEIVED = 'REPLACEMENT_RECEIVED',
}

// ── Circulation workflow types ─────────────────────────────────────────────────

export interface CirculationAction {
  type: 'BORROW' | 'RETURN' | 'RENEW';
  studentId: string;
  copyId: string;
  borrowId?: string; // for return/renew
}

export interface ScanResult {
  type: 'STUDENT' | 'BOOK' | 'LOAN_TOKEN';
  id: string;
  data?: any;
}

// ── UI State types ─────────────────────────────────────────────────────────────

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export interface PaginatedState<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
}
