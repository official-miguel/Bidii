"use client";

/**
 * src/lib/stores/attendanceStore.ts
 *
 * Store for attendance records — loaded on demand per class+date from API.
 */

import { create } from "zustand";

export type LocalAttendance = {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  date: string;
  status: "PRESENT" | "ABSENT";
  recordedById: string | null;
  createdAt: string;
  updatedAt: string;
};

interface AttendanceState {
  byClassDate: Map<string, LocalAttendance[]>;
  loading: boolean;
  loadClassDate: (classId: string, date: string) => Promise<void>;
  upsert: (record: LocalAttendance) => Promise<void>;
  upsertMany: (records: LocalAttendance[]) => Promise<void>;
}

function classDateKey(classId: string, date: string) {
  return `${classId}|${date.slice(0, 10)}`;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  byClassDate: new Map(),
  loading: false,

  async loadClassDate(classId, date) {
    const key = classDateKey(classId, date);
    if (get().byClassDate.has(key)) return;
    set({ loading: true });
    try {
      const res = await fetch(
        `/api/attendance?classId=${encodeURIComponent(classId)}&date=${date.slice(0, 10)}`
      );
      if (!res.ok) throw new Error("Failed to load attendance");
      const data = await res.json();

      // The roster endpoint returns { classId, date, students: [...] }.
      // Map the students array into LocalAttendance records so the store
      // always holds a uniform array type.
      const raw: { studentId: string; present: boolean; recordId?: string | null }[] =
        Array.isArray(data) ? data : (data.students ?? []);

      const now = new Date().toISOString();
      const records: LocalAttendance[] = raw.map((s) => ({
        id:           s.recordId ?? `remote-${s.studentId}-${date.slice(0, 10)}`,
        schoolId:     "",
        studentId:    s.studentId,
        classId,
        date:         date.slice(0, 10),
        status:       s.present ? "PRESENT" : "ABSENT",
        recordedById: null,
        createdAt:    now,
        updatedAt:    now,
      }));

      set((s) => {
        const next = new Map(s.byClassDate);
        next.set(key, records);
        return { byClassDate: next, loading: false };
      });
    } catch {
      set({ loading: false });
    }
  },

  async upsert(record) {
    const key = classDateKey(record.classId, record.date);
    set((s) => {
      const existing = s.byClassDate.get(key) ?? [];
      const next = new Map(s.byClassDate);
      const updated = existing.some((r) => r.id === record.id)
        ? existing.map((r) => (r.id === record.id ? record : r))
        : [...existing, record];
      next.set(key, updated);
      return { byClassDate: next };
    });

    // Persist to server
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  },

  async upsertMany(records) {
    if (records.length === 0) return;

    set((s) => {
      const next = new Map(s.byClassDate);
      for (const record of records) {
        const key = classDateKey(record.classId, record.date);
        const existing = next.get(key) ?? [];
        const updated = existing.some((r) => r.id === record.id)
          ? existing.map((r) => (r.id === record.id ? record : r))
          : [...existing, record];
        next.set(key, updated);
      }
      return { byClassDate: next };
    });

    // Batch persist to server
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(records),
    });
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getAttendanceForClassDate(classId: string, date: string): LocalAttendance[] {
  const key = `${classId}|${date.slice(0, 10)}`;
  return useAttendanceStore.getState().byClassDate.get(key) ?? [];
}

export function getAttendanceForStudent(studentId: string): LocalAttendance[] {
  const all: LocalAttendance[] = [];
  for (const records of useAttendanceStore.getState().byClassDate.values()) {
    for (const r of records) {
      if (r.studentId === studentId) all.push(r);
    }
  }
  return all.sort((a, b) => b.date.localeCompare(a.date));
}
