"use client";

/**
 * src/lib/stores/assessmentStore.ts
 *
 * Global store for assessment frameworks, periods, and items — fetches from API.
 */

import { create } from "zustand";

export type LocalAssessmentFramework = {
  id: string;
  schoolId: string;
  type: string;
  label: string;
  academicYear: string;
  isActive: boolean;
  updatedAt: string;
};

export type LocalAssessmentPeriod = {
  id: string;
  schoolId: string;
  frameworkId: string;
  name: string;
  academicYear: string;
  term: number | null;
  weight: number;
  maxMarks: number | null;
  isCurrent: boolean;
  openingDate: string | null;
  closingDate: string | null;
  updatedAt: string;
};

export type LocalAssessmentItem = {
  id: string;
  schoolId: string;
  frameworkId: string;
  periodId: string;
  studentId: string;
  enteredById: string | null;
  resultKind: string;
  numericScore: number | null;
  performanceLevel: string | null;
  competencyStatus: string | null;
  subjectId: string | null;
  paperId: string | null;
  learningAreaId: string | null;
  strandId: string | null;
  subStrandId: string | null;
  competencyUnitId: string | null;
  elementId: string | null;
  criterionId: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

interface AssessmentState {
  frameworks: LocalAssessmentFramework[];
  periods: LocalAssessmentPeriod[];
  itemsByPeriod: Map<string, LocalAssessmentItem[]>;
  loading: boolean;

  fetchFrameworksAndPeriods: () => Promise<void>;
  loadItemsForPeriod: (periodId: string) => Promise<void>;
  upsertItem: (item: LocalAssessmentItem) => void;

  currentPeriod: () => LocalAssessmentPeriod | undefined;
  periodsForFramework: (frameworkId: string) => LocalAssessmentPeriod[];
  itemsForStudent: (periodId: string, studentId: string) => LocalAssessmentItem[];
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  frameworks: [],
  periods: [],
  itemsByPeriod: new Map(),
  loading: false,

  async fetchFrameworksAndPeriods() {
    set({ loading: true });
    try {
      const [fwRes, pRes] = await Promise.all([
        fetch("/api/assessments/frameworks"),
        fetch("/api/assessments/periods"),
      ]);
      const [frameworks, periods] = await Promise.all([
        fwRes.ok ? fwRes.json() : [],
        pRes.ok ? pRes.json() : [],
      ]);
      set({ frameworks, periods, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async loadItemsForPeriod(periodId) {
    if (get().itemsByPeriod.has(periodId)) return;
    try {
      const res = await fetch(
        `/api/assessments/marksheet?periodId=${encodeURIComponent(periodId)}`
      );
      if (!res.ok) return;
      const items: LocalAssessmentItem[] = await res.json();
      set((s) => {
        const next = new Map(s.itemsByPeriod);
        next.set(periodId, items);
        return { itemsByPeriod: next };
      });
    } catch {
      /* non-fatal */
    }
  },

  upsertItem(item) {
    set((s) => {
      const existing = s.itemsByPeriod.get(item.periodId) ?? [];
      const updated = existing.some((x) => x.id === item.id)
        ? existing.map((x) => (x.id === item.id ? item : x))
        : [...existing, item];
      const next = new Map(s.itemsByPeriod);
      next.set(item.periodId, updated);
      return { itemsByPeriod: next };
    });
  },

  currentPeriod() {
    return get().periods.find((p) => p.isCurrent);
  },

  periodsForFramework(frameworkId) {
    return get().periods.filter((p) => p.frameworkId === frameworkId);
  },

  itemsForStudent(periodId, studentId) {
    return (get().itemsByPeriod.get(periodId) ?? []).filter(
      (i) => i.studentId === studentId
    );
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getCurrentPeriod(): LocalAssessmentPeriod | undefined {
  return useAssessmentStore.getState().periods.find((p) => p.isCurrent);
}

export function getPeriodsForFramework(
  frameworkId: string
): LocalAssessmentPeriod[] {
  return useAssessmentStore
    .getState()
    .periods.filter((p) => p.frameworkId === frameworkId);
}

export function getItemsForStudent(
  periodId: string,
  studentId: string
): LocalAssessmentItem[] {
  return (
    useAssessmentStore.getState().itemsByPeriod.get(periodId) ?? []
  ).filter((i) => i.studentId === studentId);
}
