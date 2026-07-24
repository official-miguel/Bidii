"use client";

/**
 * src/lib/stores/classesStore.ts
 *
 * Global store for SchoolClass records — fetches from API, held in memory.
 */

import { create } from "zustand";

export type LocalSchoolClass = {
  id: string;
  name: string;
  form: number;
  stream: string | null;
  classTeacherId: string | null;
  frameworkType: string;
  schoolId: string;
  updatedAt: string;
};

interface ClassesState {
  classes: LocalSchoolClass[];
  loading: boolean;
  fetch: () => Promise<void>;
  upsert: (cls: LocalSchoolClass) => void;
}

export const useClassesStore = create<ClassesState>((set) => ({
  classes: [],
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const res = await fetch("/api/classes");
      if (!res.ok) throw new Error("Failed to load classes");
      const data: LocalSchoolClass[] = await res.json();
      data.sort((a, b) => a.form - b.form || a.name.localeCompare(b.name));
      set({ classes: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsert(cls) {
    set((s) => ({
      classes: s.classes.some((x) => x.id === cls.id)
        ? s.classes.map((x) => (x.id === cls.id ? cls : x))
        : [...s.classes, cls].sort((a, b) => a.form - b.form || a.name.localeCompare(b.name)),
    }));
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function classesByForm(form: number): LocalSchoolClass[] {
  return useClassesStore.getState().classes.filter((c) => c.form === form);
}

export function getClassById(id: string): LocalSchoolClass | undefined {
  return useClassesStore.getState().classes.find((c) => c.id === id);
}
