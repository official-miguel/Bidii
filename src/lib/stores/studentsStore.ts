"use client";

/**
 * src/lib/stores/studentsStore.ts
 *
 * Global store for students — fetches from API, held in memory.
 */

import { create } from "zustand";

export type LocalStudent = {
  id: string;
  admissionNumber: string;
  fullName: string;
  dateOfBirth: string | null;
  classId: string;
  parentName: string | null;
  parentContact: string | null;
  schoolId: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

interface StudentsState {
  students: LocalStudent[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  upsert: (student: LocalStudent) => void;
  remove: (id: string) => void;
}

export const useStudentsStore = create<StudentsState>((set) => ({
  students: [],
  loading: false,
  error: null,

  async fetch() {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/students");
      if (!res.ok) throw new Error("Failed to load students");
      const data: LocalStudent[] = await res.json();
      data.sort((a, b) => a.fullName.localeCompare(b.fullName));
      set({ students: data, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  upsert(student) {
    set((s) => ({
      students: s.students.some((x) => x.id === student.id)
        ? s.students.map((x) => (x.id === student.id ? student : x))
        : [...s.students, student].sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          ),
    }));
  },

  remove(id) {
    set((s) => ({ students: s.students.filter((x) => x.id !== id) }));
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function searchStudents(query: string): LocalStudent[] {
  if (!query.trim()) return useStudentsStore.getState().students;
  const q = query.toLowerCase();
  return useStudentsStore.getState().students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(q) ||
      s.admissionNumber.toLowerCase().includes(q) ||
      (s.parentName?.toLowerCase().includes(q) ?? false)
  );
}

export function studentsByClass(classId: string): LocalStudent[] {
  return useStudentsStore.getState().students.filter((s) => s.classId === classId);
}
