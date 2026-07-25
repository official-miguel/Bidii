"use client";

/**
 * useFormDraft — system-wide form draft persistence.
 *
 * Stores a typed draft object in localStorage under a stable key.
 * The draft survives page reloads and accidental navigation away.
 * It is cleared explicitly when the form is submitted successfully.
 *
 * Usage:
 *
 *   const [draft, setDraft, clearDraft] = useFormDraft("bidii_draft_my_form", {
 *     name: "",
 *     body: "",
 *   });
 *
 *   // Bind state:
 *   const [name, setName] = useState(draft.name);
 *   const [body, setBody] = useState(draft.body);
 *
 *   // Persist on every change:
 *   useEffect(() => setDraft({ name, body }), [name, body]);
 *
 *   // Clear on success:
 *   async function handleSubmit() {
 *     await save();
 *     clearDraft();
 *   }
 *
 * Rules:
 *  - The key MUST be globally unique across the app (prefix with "bidii_draft_").
 *  - Never persist passwords, API keys, or other secrets.
 *  - For edit forms, include the record id in the key so drafts don't bleed
 *    across different records, e.g. `bidii_draft_student_${editing?.id ?? "new"}`.
 *  - For modal forms that can be opened for different records, reset the draft
 *    (call clearDraft + reinitialise) whenever the modal opens with a new record.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — fail silently
  }
}

function deleteStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type SetDraft<T> = (patch: Partial<T> | ((prev: T) => T)) => void;
type ClearDraft  = () => void;

/**
 * @param key      A globally unique localStorage key, e.g. "bidii_draft_composer"
 * @param defaults The shape + default values of the draft (used when no draft exists)
 * @returns        [draft, setDraft, clearDraft]
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): [T, SetDraft<T>, ClearDraft] {
  // Initialise from localStorage on first render (client only).
  // We use a ref so the initialization only runs once even in strict mode.
  const initialized = useRef(false);
  const [draft, setDraftState] = useState<T>(() => {
    const stored = readStorage<Partial<T>>(key, {});
    return { ...defaults, ...stored };
  });

  // Persist to localStorage whenever the draft changes.
  useEffect(() => {
    if (!initialized.current) { initialized.current = true; return; }
    writeStorage(key, draft);
  }, [key, draft]);

  const setDraft: SetDraft<T> = useCallback(
    (patch) => {
      setDraftState((prev) =>
        typeof patch === "function"
          ? patch(prev)
          : { ...prev, ...patch }
      );
    },
    [],
  );

  const clearDraft: ClearDraft = useCallback(() => {
    deleteStorage(key);
    setDraftState(defaults);
    // Reset initialized flag so next setDraft doesn't immediately re-write
    initialized.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [draft, setDraft, clearDraft];
}
