"use client";

/**
 * src/lib/stores/staffStore.ts
 *
 * Global store for teachers, departments, and subjects — fetches from API.
 */

import { create } from "zustand";

export type LocalTeacher = {
  id: string;
  staffId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  primaryDepartmentId: string | null;
  todEligible: boolean;
  schoolId: string;
  userId: string | null;
  updatedAt: string;
};

export type LocalDepartment = {
  id: string;
  name: string;
  headTeacherId: string | null;
  schoolId: string;
  updatedAt: string;
};

export type LocalSubject = {
  id: string;
  name: string;
  code: string;
  type: string;
  departmentId: string;
  applicableForms: number[];
  schoolId: string;
  updatedAt: string;
};

interface StaffState {
  teachers: LocalTeacher[];
  departments: LocalDepartment[];
  subjects: LocalSubject[];
  loading: boolean;
  fetch: () => Promise<void>;
  upsertTeacher: (t: LocalTeacher) => void;
  upsertDepartment: (d: LocalDepartment) => void;
  upsertSubject: (s: LocalSubject) => void;
  getTeacherById: (id: string) => LocalTeacher | undefined;
  getDepartmentById: (id: string) => LocalDepartment | undefined;
  getSubjectById: (id: string) => LocalSubject | undefined;
  searchTeachers: (q: string) => LocalTeacher[];
}

export const useStaffStore = create<StaffState>((set, get) => ({
  teachers: [],
  departments: [],
  subjects: [],
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const [teacherRes, deptRes, subjectRes] = await Promise.all([
        fetch("/api/staff"),
        fetch("/api/departments"),
        fetch("/api/subjects"),
      ]);
      const [teachers, departments, subjects] = await Promise.all([
        teacherRes.ok ? teacherRes.json() : [],
        deptRes.ok ? deptRes.json() : [],
        subjectRes.ok ? subjectRes.json() : [],
      ]);
      teachers.sort((a: LocalTeacher, b: LocalTeacher) =>
        a.fullName.localeCompare(b.fullName)
      );
      departments.sort((a: LocalDepartment, b: LocalDepartment) =>
        a.name.localeCompare(b.name)
      );
      subjects.sort((a: LocalSubject, b: LocalSubject) =>
        a.name.localeCompare(b.name)
      );
      set({ teachers, departments, subjects, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsertTeacher(t) {
    set((s) => ({
      teachers: s.teachers.some((x) => x.id === t.id)
        ? s.teachers.map((x) => (x.id === t.id ? t : x))
        : [...s.teachers, t].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }));
  },

  upsertDepartment(d) {
    set((s) => ({
      departments: s.departments.some((x) => x.id === d.id)
        ? s.departments.map((x) => (x.id === d.id ? d : x))
        : [...s.departments, d].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  upsertSubject(sub) {
    set((s) => ({
      subjects: s.subjects.some((x) => x.id === sub.id)
        ? s.subjects.map((x) => (x.id === sub.id ? sub : x))
        : [...s.subjects, sub].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  getTeacherById(id) {
    return get().teachers.find((t) => t.id === id);
  },

  getDepartmentById(id) {
    return get().departments.find((d) => d.id === id);
  },

  getSubjectById(id) {
    return get().subjects.find((s) => s.id === id);
  },

  searchTeachers(q) {
    if (!q.trim()) return get().teachers;
    const lower = q.toLowerCase();
    return get().teachers.filter(
      (t) =>
        t.fullName.toLowerCase().includes(lower) ||
        t.staffId.toLowerCase().includes(lower) ||
        (t.email?.toLowerCase().includes(lower) ?? false)
    );
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getTeacherById(id: string): LocalTeacher | undefined {
  return useStaffStore.getState().teachers.find((t) => t.id === id);
}

export function getDepartmentById(id: string): LocalDepartment | undefined {
  return useStaffStore.getState().departments.find((d) => d.id === id);
}

export function getSubjectById(id: string): LocalSubject | undefined {
  return useStaffStore.getState().subjects.find((s) => s.id === id);
}

export function searchTeachers(q: string): LocalTeacher[] {
  if (!q.trim()) return useStaffStore.getState().teachers;
  const lower = q.toLowerCase();
  return useStaffStore.getState().teachers.filter(
    (t) =>
      t.fullName.toLowerCase().includes(lower) ||
      t.staffId.toLowerCase().includes(lower) ||
      (t.email?.toLowerCase().includes(lower) ?? false)
  );
}
