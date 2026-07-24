"use client";

/**
 * src/lib/stores/staffRolesStore.ts
 *
 * Global store for StaffRole records — fetches from API.
 */

import { create } from "zustand";

export type LocalStaffRole = {
  id: string;
  schoolId: string;
  name: string;
  description: string | null;
  permissions: { module: string; canView: boolean; canManage: boolean }[];
  createdAt: string;
  updatedAt: string;
};

interface StaffRolesState {
  roles: LocalStaffRole[];
  loading: boolean;
  fetch: () => Promise<void>;
  upsert: (role: LocalStaffRole) => void;
  remove: (id: string) => void;
  getById: (id: string) => LocalStaffRole | undefined;
}

export const useStaffRolesStore = create<StaffRolesState>((set, get) => ({
  roles: [],
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const res = await fetch("/api/staff-roles");
      if (!res.ok) throw new Error("Failed to load staff roles");
      const data: LocalStaffRole[] = await res.json();
      data.sort((a, b) => a.name.localeCompare(b.name));
      set({ roles: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsert(role) {
    set((s) => ({
      roles: s.roles.some((x) => x.id === role.id)
        ? s.roles.map((x) => (x.id === role.id ? role : x))
        : [...s.roles, role].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  },

  remove(id) {
    set((s) => ({ roles: s.roles.filter((x) => x.id !== id) }));
  },

  getById(id) {
    return get().roles.find((r) => r.id === id);
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getStaffRoleById(id: string): LocalStaffRole | undefined {
  return useStaffRolesStore.getState().roles.find((r) => r.id === id);
}
