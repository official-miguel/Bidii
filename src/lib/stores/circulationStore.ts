"use client";

/**
 * src/lib/stores/circulationStore.ts
 *
 * Store for Library Stage 2 circulation entities — fetches from API.
 *   - LibraryPolicy   — per-patron-type rules
 *   - LibraryFinePause — active fine pauses
 *   - LibraryReservation — pending/active reservations
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalLibraryPolicy = {
  id: string;
  schoolId: string;
  patronType: string;
  label: string | null;
  maxBooksAllowed: number;
  borrowDays: number;
  gracePeriodDays: number;
  finePerDay: number;
  countWeekends: boolean;
  countHolidays: boolean;
  maxRenewals: number;
  fineBlockThreshold: number;
  lostBookMultiplier: number;
  lostBookFixedFee: number;
  damagedBookFineRate: number;
  reservationsAllowed: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalLibraryFinePause = {
  id: string;
  schoolId: string;
  scope: string;
  studentId: string | null;
  label: string;
  reason: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalLibraryReservation = {
  id: string;
  schoolId: string;
  catalogueId: string;
  reservationType: string;
  studentId: string | null;
  teacherId: string | null;
  departmentName: string | null;
  expectedReturnDate: string | null;
  quantityRequested: number;
  notes: string | null;
  status: string;
  allocatedCopyId: string | null;
  fulfilledAt: string | null;
  expiresAt: string | null;
  queuePosition: number | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface PolicyEvalResult {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
  maxBooks: number;
  borrowDays: number;
  finePerDay: number;
  gracePeriodDays: number;
  maxRenewals: number;
  fineBlockThreshold: number;
}

interface CirculationState {
  policies: LocalLibraryPolicy[];
  finePauses: LocalLibraryFinePause[];
  reservations: LocalLibraryReservation[];
  loading: boolean;

  fetch: () => Promise<void>;
  upsertPolicy: (p: LocalLibraryPolicy) => void;
  upsertFinePause: (p: LocalLibraryFinePause) => void;
  upsertReservation: (r: LocalLibraryReservation) => void;

  policyForPatron: (patronType: string) => LocalLibraryPolicy | undefined;
  isFinePaused: (studentId?: string) => boolean;
  reservationsForCatalogue: (catalogueId: string, status?: string) => LocalLibraryReservation[];
  nextWaitlistPosition: (catalogueId: string) => number;
  evaluateBorrow: (params: {
    patronType?: string;
    currentBorrowCount: number;
    fineBalance: number;
    cardStatus: string;
    cardExpired: boolean;
    copyStatus: string;
    catalogueId: string;
    studentId?: string;
  }) => PolicyEvalResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activeNow(pause: LocalLibraryFinePause): boolean {
  const now = Date.now();
  const start = new Date(pause.startDate).getTime();
  const end = pause.endDate ? new Date(pause.endDate).getTime() : Infinity;
  return pause.isActive && now >= start && now <= end;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCirculationStore = create<CirculationState>((set, get) => ({
  policies: [],
  finePauses: [],
  reservations: [],
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const [policyRes, pauseRes, resRes] = await Promise.all([
        fetch("/api/library/policies"),
        fetch("/api/library/fines/pause"),
        fetch("/api/library/reservations"),
      ]);
      const [policies, finePauses, reservations] = await Promise.all([
        policyRes.ok ? policyRes.json() : [],
        pauseRes.ok ? pauseRes.json() : [],
        resRes.ok ? resRes.json() : [],
      ]);
      set({ policies, finePauses, reservations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsertPolicy(p) {
    set((s) => ({
      policies: s.policies.some((x) => x.id === p.id)
        ? s.policies.map((x) => (x.id === p.id ? p : x))
        : [...s.policies, p],
    }));
  },

  upsertFinePause(p) {
    set((s) => ({
      finePauses: s.finePauses.some((x) => x.id === p.id)
        ? s.finePauses.map((x) => (x.id === p.id ? p : x))
        : [...s.finePauses, p],
    }));
  },

  upsertReservation(r) {
    set((s) => ({
      reservations: s.reservations.some((x) => x.id === r.id)
        ? s.reservations.map((x) => (x.id === r.id ? r : x))
        : [...s.reservations, r],
    }));
  },

  policyForPatron(patronType) {
    const { policies } = get();
    return (
      policies.find((p) => p.patronType === patronType && p.isActive) ??
      policies.find((p) => p.patronType === "DEFAULT" && p.isActive)
    );
  },

  isFinePaused(studentId) {
    return get().finePauses.some((p) => {
      if (!activeNow(p)) return false;
      if (p.scope === "SCHOOL_WIDE") return true;
      if (p.scope === "STUDENT" && studentId && p.studentId === studentId) return true;
      return false;
    });
  },

  reservationsForCatalogue(catalogueId, status) {
    const list = get().reservations.filter((r) => r.catalogueId === catalogueId);
    return status ? list.filter((r) => r.status === status) : list;
  },

  nextWaitlistPosition(catalogueId) {
    const active = get().reservations.filter(
      (r) =>
        r.catalogueId === catalogueId &&
        (r.status === "PENDING" || r.status === "ACTIVE") &&
        r.reservationType === "WAITLIST"
    );
    if (active.length === 0) return 1;
    return Math.max(...active.map((r) => r.queuePosition ?? 0)) + 1;
  },

  evaluateBorrow(params) {
    const {
      patronType = "DEFAULT",
      currentBorrowCount,
      fineBalance,
      cardStatus,
      cardExpired,
      copyStatus,
      catalogueId,
      studentId,
    } = params;

    const state = get();
    const policy = state.policyForPatron(patronType);
    const maxBooks = policy?.maxBooksAllowed ?? 3;
    const borrowDays = policy?.borrowDays ?? 14;
    const finePerDay = policy?.finePerDay ?? 5;
    const graceDays = policy?.gracePeriodDays ?? 0;
    const maxRenewals = policy?.maxRenewals ?? 1;
    const fineThreshold = policy?.fineBlockThreshold ?? 0;

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (cardStatus === "SUSPENDED") {
      reasons.push("Library card is suspended. Contact the librarian to reinstate.");
    } else if (cardStatus === "ALUMNI" || cardStatus === "TRANSFERRED") {
      reasons.push(`Library card is inactive (${cardStatus}). Borrowing not permitted.`);
    }
    if (cardExpired) {
      reasons.push("Library card has expired. Renew the card before borrowing.");
    }
    if (fineBalance > fineThreshold) {
      reasons.push(
        `Outstanding fine of KES ${fineBalance.toFixed(2)} exceeds the allowed threshold` +
        (fineThreshold > 0 ? ` of KES ${fineThreshold.toFixed(2)}` : "") +
        ". Clear the fine before borrowing."
      );
    }
    if (currentBorrowCount >= maxBooks) {
      reasons.push(
        `Borrowing limit reached (${currentBorrowCount}/${maxBooks} books). ` +
        "Return a book before borrowing another."
      );
    } else if (currentBorrowCount === maxBooks - 1) {
      warnings.push(
        `This will be the last borrowing slot (${currentBorrowCount + 1}/${maxBooks}).`
      );
    }
    if (copyStatus === "BORROWED") {
      reasons.push("This copy is currently borrowed by another student.");
    } else if (copyStatus === "RESERVED") {
      const res = state.reservations.filter(
        (r) =>
          r.catalogueId === catalogueId &&
          r.status === "ACTIVE" &&
          r.studentId === studentId
      );
      if (res.length === 0) {
        reasons.push(
          "This copy has been reserved for another patron. Choose a different copy or join the waitlist."
        );
      }
    } else if (copyStatus === "UNDER_REPAIR") {
      reasons.push("This copy is currently under repair and cannot be borrowed.");
    } else if (copyStatus === "ARCHIVED") {
      reasons.push("This copy has been removed from circulation.");
    }
    if (state.isFinePaused(studentId)) {
      warnings.push("Fine accumulation is currently paused for this student.");
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      warnings,
      maxBooks,
      borrowDays,
      finePerDay,
      gracePeriodDays: graceDays,
      maxRenewals,
      fineBlockThreshold: fineThreshold,
    };
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getPolicyForPatron(
  patronType: string
): LocalLibraryPolicy | undefined {
  return useCirculationStore.getState().policyForPatron(patronType);
}

export function isFinePaused(studentId?: string): boolean {
  return useCirculationStore.getState().isFinePaused(studentId);
}

export function evaluateBorrow(params: {
  patronType?: string;
  currentBorrowCount: number;
  fineBalance: number;
  cardStatus: string;
  cardExpired: boolean;
  copyStatus: string;
  catalogueId: string;
  studentId?: string;
}): PolicyEvalResult {
  return useCirculationStore.getState().evaluateBorrow(params);
}

export function getReservationsForCatalogue(
  catalogueId: string,
  status?: string
): LocalLibraryReservation[] {
  return useCirculationStore.getState().reservationsForCatalogue(catalogueId, status);
}
