/**
 * Workspace state persistence utilities.
 *
 * Remembers scroll position, filters, tabs, sorting, and panel states
 * for each module workspace so users can return to exactly where they left off.
 *
 * Uses sessionStorage for ephemeral state (cleared when browser closes)
 * and localStorage for persistent preferences (survives closing browser).
 */

// ── Session Storage (ephemeral state) ─────────────────────────────────────

export interface WorkspaceState {
  scrollY?: number;
  search?: string;
  filters?: Record<string, string>;
  activeTab?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  expandedPanels?: string[];
  selectedItems?: string[];
}

/**
 * Save workspace state to sessionStorage.
 * State is cleared when the browser/tab is closed.
 */
export function saveWorkspaceState(moduleKey: string, state: WorkspaceState): void {
  try {
    sessionStorage.setItem(`workspace:${moduleKey}`, JSON.stringify(state));
  } catch (e) {
    // Quota exceeded or sessionStorage disabled — fail silently
    console.warn("Could not save workspace state:", e);
  }
}

/**
 * Load workspace state from sessionStorage.
 * Returns null if no state exists or parsing fails.
 */
export function loadWorkspaceState(moduleKey: string): WorkspaceState | null {
  try {
    const stored = sessionStorage.getItem(`workspace:${moduleKey}`);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    console.warn("Could not load workspace state:", e);
    return null;
  }
}

/**
 * Clear workspace state for a specific module.
 */
export function clearWorkspaceState(moduleKey: string): void {
  try {
    sessionStorage.removeItem(`workspace:${moduleKey}`);
  } catch (e) {
    console.warn("Could not clear workspace state:", e);
  }
}

/**
 * Update a single field in the workspace state without replacing the entire object.
 */
export function updateWorkspaceState(
  moduleKey: string,
  updates: Partial<WorkspaceState>
): void {
  const current = loadWorkspaceState(moduleKey) || {};
  saveWorkspaceState(moduleKey, { ...current, ...updates });
}

// ── Local Storage (persistent preferences) ────────────────────────────────

export interface WorkspacePreferences {
  viewMode?: "list" | "grid" | "table";
  itemsPerPage?: number;
  compactMode?: boolean;
  theme?: "light" | "dark" | "auto";
  columns?: string[];
}

/**
 * Save workspace preferences to localStorage.
 * Preferences persist across browser sessions.
 */
export function saveWorkspacePreferences(
  moduleKey: string,
  preferences: WorkspacePreferences
): void {
  try {
    localStorage.setItem(`workspace:prefs:${moduleKey}`, JSON.stringify(preferences));
  } catch (e) {
    console.warn("Could not save workspace preferences:", e);
  }
}

/**
 * Load workspace preferences from localStorage.
 * Returns null if no preferences exist or parsing fails.
 */
export function loadWorkspacePreferences(moduleKey: string): WorkspacePreferences | null {
  try {
    const stored = localStorage.getItem(`workspace:prefs:${moduleKey}`);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    console.warn("Could not load workspace preferences:", e);
    return null;
  }
}

/**
 * Update a single preference field without replacing the entire object.
 */
export function updateWorkspacePreferences(
  moduleKey: string,
  updates: Partial<WorkspacePreferences>
): void {
  const current = loadWorkspacePreferences(moduleKey) || {};
  saveWorkspacePreferences(moduleKey, { ...current, ...updates });
}

// ── React Hooks ───────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";

/**
 * Hook to persist workspace state in sessionStorage.
 *
 * Usage:
 * ```tsx
 * const [search, setSearch] = useWorkspaceState("students", "search", "");
 * const [filterClass, setFilterClass] = useWorkspaceState("students", "filterClass", "");
 * ```
 */
export function useWorkspaceState<T>(
  moduleKey: string,
  stateKey: keyof WorkspaceState,
  initialValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const state = loadWorkspaceState(moduleKey);
    return state && stateKey in state ? (state[stateKey] as T) : initialValue;
  });

  const updateValue = useCallback(
    (newValue: T) => {
      setValue(newValue);
      updateWorkspaceState(moduleKey, { [stateKey]: newValue });
    },
    [moduleKey, stateKey]
  );

  return [value, updateValue];
}

/**
 * Hook to persist workspace preferences in localStorage.
 *
 * Usage:
 * ```tsx
 * const [viewMode, setViewMode] = useWorkspacePreference("students", "viewMode", "list");
 * ```
 */
export function useWorkspacePreference<T>(
  moduleKey: string,
  prefKey: keyof WorkspacePreferences,
  initialValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const prefs = loadWorkspacePreferences(moduleKey);
    return prefs && prefKey in prefs ? (prefs[prefKey] as T) : initialValue;
  });

  const updateValue = useCallback(
    (newValue: T) => {
      setValue(newValue);
      updateWorkspacePreferences(moduleKey, { [prefKey]: newValue });
    },
    [moduleKey, prefKey]
  );

  return [value, updateValue];
}

/**
 * Hook to restore scroll position when component mounts.
 *
 * Usage:
 * ```tsx
 * useScrollRestoration("students");
 * ```
 */
export function useScrollRestoration(moduleKey: string): void {
  useEffect(() => {
    const state = loadWorkspaceState(moduleKey);
    if (state?.scrollY !== undefined) {
      // Delay scroll restoration to allow content to render
      requestAnimationFrame(() => {
        window.scrollTo(0, state.scrollY as number);
      });
    }

    // Save scroll position on unmount
    return () => {
      updateWorkspaceState(moduleKey, { scrollY: window.scrollY });
    };
  }, [moduleKey]);
}

/**
 * Hook to save scroll position periodically while scrolling.
 *
 * Usage:
 * ```tsx
 * useScrollPersistence("students");
 * ```
 */
export function useScrollPersistence(moduleKey: string): void {
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        updateWorkspaceState(moduleKey, { scrollY: window.scrollY });
      }, 200); // Debounce for 200ms
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
    };
  }, [moduleKey]);
}

/**
 * Hook to track and restore multiple filter values.
 *
 * Usage:
 * ```tsx
 * const [filters, setFilter, clearFilters] = useWorkspaceFilters("students", {
 *   class: "",
 *   form: "",
 * });
 * ```
 */
export function useWorkspaceFilters<T extends Record<string, string>>(
  moduleKey: string,
  initialFilters: T
): [T, (key: keyof T, value: string) => void, () => void] {
  const [filters, setFilters] = useState<T>(() => {
    const state = loadWorkspaceState(moduleKey);
    return state?.filters ? ({ ...initialFilters, ...state.filters } as T) : initialFilters;
  });

  const setFilter = useCallback(
    (key: keyof T, value: string) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        updateWorkspaceState(moduleKey, { filters: next as Record<string, string> });
        return next;
      });
    },
    [moduleKey]
  );

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    updateWorkspaceState(moduleKey, { filters: initialFilters as Record<string, string> });
  }, [moduleKey, initialFilters]);

  return [filters, setFilter, clearFilters];
}
