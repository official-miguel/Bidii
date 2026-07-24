"use client";

/**
 * src/lib/stores/calendarStore.ts
 *
 * Global store for school calendar events — fetches from API.
 */

import { create } from "zustand";

export type LocalCalendarEvent = {
  id: string;
  schoolId: string;
  title: string;
  description: string | null;
  date: string;
  type: string;
  audience: "EVERYONE" | "STAFF_ONLY" | "PARENTS_ONLY";
  openingDate: string | null;
  closingDate: string | null;
  createdById: string | null;
  updatedAt: string;
};

interface CalendarState {
  events: LocalCalendarEvent[];
  loading: boolean;
  fetch: () => Promise<void>;
  upsert: (event: LocalCalendarEvent) => void;
  remove: (id: string) => void;
  forMonth: (yearMonth: string) => LocalCalendarEvent[];
  inRange: (from: string, to: string) => LocalCalendarEvent[];
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  loading: false,

  async fetch() {
    set({ loading: true });
    try {
      const res = await fetch("/api/calendar/events");
      if (!res.ok) throw new Error("Failed to load calendar events");
      const data: LocalCalendarEvent[] = await res.json();
      data.sort((a, b) => a.date.localeCompare(b.date));
      set({ events: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upsert(event) {
    set((s) => ({
      events: s.events.some((x) => x.id === event.id)
        ? s.events.map((x) => (x.id === event.id ? event : x))
        : [...s.events, event].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  },

  remove(id) {
    set((s) => ({ events: s.events.filter((x) => x.id !== id) }));
  },

  forMonth(yearMonth) {
    return get().events.filter((e) => e.date.startsWith(yearMonth));
  },

  inRange(from, to) {
    return get().events.filter((e) => e.date >= from && e.date <= to);
  },
}));

// ---------------------------------------------------------------------------
// Standalone query utilities
// ---------------------------------------------------------------------------

export function getCalendarEventsForMonth(yearMonth: string): LocalCalendarEvent[] {
  return useCalendarStore.getState().events.filter((e) =>
    e.date.startsWith(yearMonth)
  );
}

export function getCalendarEventsInRange(
  from: string,
  to: string
): LocalCalendarEvent[] {
  return useCalendarStore
    .getState()
    .events.filter((e) => e.date >= from && e.date <= to);
}
