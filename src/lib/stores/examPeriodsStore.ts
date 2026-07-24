"use client";

/**
 * src/lib/stores/examPeriodsStore.ts
 *
 * Store for assessment periods — fetches from API.
 */

import { create } from "zustand";

export type LocalExamPeriod = {
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
  createdAt: string;
  updatedAt: string;
};

interface ExamPeriodsState {
  periods: LocalExamPeriod[];
  loading: boolean;
  fetch: () => Promise<void>;
  upsert: (period: LocalExamPeriod) => void;
  current: () => LocalExamPeriod | undefined;
  forYear: (year: string) => LocalExamPeriod[];
  getById: (id: string) => LocalExamPeriod | undefined;
}

export const useExamPeriodsStore = create<ExamPeriodsState>((set, get) => ({
  periods: [],
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const res = await fetch("/api/assessments/periods");
      if (!res.ok) throw new Error("Failed to load periods");
      const data: LocalExamPeriod[] = await res.json();
      data.sort(
        (a, b) =>
          b.academicYear.localeCompare(a.academicYear) ||
          (a.term ?? 0) - (b.term ?? 0)
      );
      set({ periods: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsert(period) {
    set((s) => ({
      periods: s.periods.some((x) => x.id === period.id)
        ? s.periods.map((x) => (x.id === period.id ? period : x))
        : [period, ...s.periods],
    }));
  },

  current() {
    return get().periods.find((p) => p.isCurrent);
  },

  forYear(year) {
    return get().periods.filter((p) => p.academicYear === year);
  },

  getById(id) {
    return get().periods.find((p) => p.id === id);
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getCurrentExamPeriod(): LocalExamPeriod | undefined {
  return useExamPeriodsStore.getState().periods.find((p) => p.isCurrent);
}

export function getExamPeriodsForYear(year: string): LocalExamPeriod[] {
  return useExamPeriodsStore
    .getState()
    .periods.filter((p) => p.academicYear === year);
}

export function getExamPeriodById(id: string): LocalExamPeriod | undefined {
  return useExamPeriodsStore.getState().periods.find((p) => p.id === id);
}
