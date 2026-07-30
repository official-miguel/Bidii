"use client";

/**
 * src/lib/stores/timetableStore.ts
 *
 * Global store for timetable slots — fetches from API.
 */

import { create } from "zustand";

export type LocalTimetableSlot = {
  id: string;
  classId: string;
  dayOfWeek: number;
  period: number;
  subjectId: string;
  teacherId: string;
  room: string | null;
  schoolId: string;
  updatedAt: string;
};

// ── Vulnerability snapshot types (mirrors liveConflictDetector exports) ────

export type VersionVulnerabilityLevel = "critical" | "high" | "moderate";

export type VersionStaffShortage = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  totalLessonsRequired: number;
  totalLessonsCapacity: number;
  deficit: number;
  assignedTeachers: number;
  estimatedExtraTeachersNeeded: number;
  affectedClasses: string[];
  level: VersionVulnerabilityLevel;
  message: string;
  suggestion: string;
};

export type VersionConflictEntry = {
  type: string;
  severity: "error" | "warning";
  message: string;
  action: string;
};

export type VersionVulnerabilities = {
  capturedAt: string;          // ISO timestamp when snapshot was taken
  totalErrors: number;
  totalWarnings: number;
  conflicts: VersionConflictEntry[];
  staffShortages: VersionStaffShortage[];
};

export type LocalTimetableVersion = {
  id: string;
  schoolId: string;
  name: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  slotCount: number;
  academicYear: string | null;
  term: number | null;
  publishedAt: string | null;
  generatedAt: string | null;
  updatedAt: string;
  /** Vulnerability snapshot stored at generation/validation time */
  vulnerabilities: VersionVulnerabilities | null;
};

export type LocalTimetableVersionSlot = {
  id: string;
  versionId: string;
  schoolId: string;
  classId: string;
  dayOfWeek: number;
  period: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  room: string | null;
  isManual: boolean;
  updatedAt: string;
};

interface TimetableState {
  slots: LocalTimetableSlot[];
  loading: boolean;
  fetch: (classId?: string) => Promise<void>;
  upsert: (slot: LocalTimetableSlot) => void;
  remove: (id: string) => void;

  versions: LocalTimetableVersion[];
  versionsLoading: boolean;
  fetchVersions: () => Promise<void>;
  upsertVersion: (version: LocalTimetableVersion) => void;
  removeVersion: (id: string) => void;

  versionSlots: Map<string, LocalTimetableVersionSlot[]>;
  fetchVersionSlots: (versionId: string) => Promise<void>;
  clearVersionSlots: (versionId: string) => void;
}

export const useTimetableStore = create<TimetableState>((set, get) => ({
  slots: [],
  loading: false,

  async fetch(classId) {
    set({ loading: true });
    try {
      const url = classId
        ? `/api/timetable?classId=${encodeURIComponent(classId)}`
        : "/api/timetable";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load timetable");
      const data: LocalTimetableSlot[] = await res.json();
      set({ slots: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsert(slot) {
    set((s) => ({
      slots: s.slots.some((x) => x.id === slot.id)
        ? s.slots.map((x) => (x.id === slot.id ? slot : x))
        : [...s.slots, slot],
    }));
  },

  remove(id) {
    set((s) => ({ slots: s.slots.filter((x) => x.id !== id) }));
  },

  versions: [],
  versionsLoading: false,

  async fetchVersions() {
    set({ versionsLoading: true });
    try {
      const res = await fetch("/api/timetable/v2/versions");
      if (!res.ok) throw new Error("Failed to load versions");
      const data: LocalTimetableVersion[] = await res.json();
      set({ versions: data, versionsLoading: false });
    } catch {
      set({ versionsLoading: false });
    }
  },

  upsertVersion(version) {
    set((s) => ({
      versions: s.versions.some((v) => v.id === version.id)
        ? s.versions.map((v) => (v.id === version.id ? version : v))
        : [...s.versions, version],
    }));
  },

  removeVersion(id) {
    set((s) => ({ versions: s.versions.filter((v) => v.id !== id) }));
    get().clearVersionSlots(id);
  },

  versionSlots: new Map(),

  async fetchVersionSlots(versionId) {
    if (get().versionSlots.has(versionId)) return;
    try {
      const res = await fetch(
        `/api/timetable/v2/versions/${encodeURIComponent(versionId)}/slots`
      );
      if (!res.ok) return;
      const slots: LocalTimetableVersionSlot[] = await res.json();
      set((s) => {
        const next = new Map(s.versionSlots);
        next.set(versionId, slots);
        return { versionSlots: next };
      });
    } catch {
      /* non-fatal */
    }
  },

  clearVersionSlots(versionId) {
    set((s) => {
      const next = new Map(s.versionSlots);
      next.delete(versionId);
      return { versionSlots: next };
    });
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getTimetableSlotsForClass(classId: string): LocalTimetableSlot[] {
  return useTimetableStore.getState().slots.filter((s) => s.classId === classId);
}

export function getTimetableSlotsForTeacher(teacherId: string): LocalTimetableSlot[] {
  return useTimetableStore.getState().slots.filter((s) => s.teacherId === teacherId);
}

export function getPublishedTimetableVersion(): LocalTimetableVersion | undefined {
  return useTimetableStore
    .getState()
    .versions.find((v) => v.status === "PUBLISHED");
}

export function getVersionSlotsForClass(
  versionId: string,
  classId: string
): LocalTimetableVersionSlot[] {
  return (
    useTimetableStore.getState().versionSlots.get(versionId) ?? []
  ).filter((s) => s.classId === classId);
}

export function getVersionSlotsForTeacher(
  versionId: string,
  teacherId: string
): LocalTimetableVersionSlot[] {
  return (
    useTimetableStore.getState().versionSlots.get(versionId) ?? []
  ).filter((s) => s.teacherId === teacherId);
}
