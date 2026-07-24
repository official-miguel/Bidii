"use client";

/**
 * src/lib/stores/disciplineStore.ts
 *
 * Global store for discipline records — fetches from API.
 */

import { create } from "zustand";

export type LocalDisciplineRecord = {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string | null;
  offence: string;
  description: string | null;
  actionTaken: string | null;
  resolution: string | null;
  dateOfOffence: string;
  status: string;
  notes: string | null;
  recordedById: string | null;
  createdAt: string;
  updatedAt: string;
};

interface DisciplineState {
  records: LocalDisciplineRecord[];
  loading: boolean;
  fetch: () => Promise<void>;
  upsert: (record: LocalDisciplineRecord) => void;
  forStudent: (studentId: string) => LocalDisciplineRecord[];
  openCases: () => LocalDisciplineRecord[];
}

export const useDisciplineStore = create<DisciplineState>((set, get) => ({
  records: [],
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const res = await fetch("/api/discipline");
      if (!res.ok) throw new Error("Failed to load discipline records");
      const data: LocalDisciplineRecord[] = await res.json();
      data.sort((a, b) => b.dateOfOffence.localeCompare(a.dateOfOffence));
      set({ records: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsert(record) {
    set((s) => ({
      records: s.records.some((x) => x.id === record.id)
        ? s.records.map((x) => (x.id === record.id ? record : x))
        : [record, ...s.records].sort((a, b) =>
            b.dateOfOffence.localeCompare(a.dateOfOffence)
          ),
    }));
  },

  forStudent(studentId) {
    return get().records.filter((r) => r.studentId === studentId);
  },

  openCases() {
    return get().records.filter(
      (r) => r.status === "OPEN" || r.status === "UNDER_REVIEW"
    );
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getDisciplineForStudent(studentId: string): LocalDisciplineRecord[] {
  return useDisciplineStore
    .getState()
    .records.filter((r) => r.studentId === studentId);
}

export function getOpenDisciplineCases(): LocalDisciplineRecord[] {
  return useDisciplineStore
    .getState()
    .records.filter((r) => r.status === "OPEN" || r.status === "UNDER_REVIEW");
}
