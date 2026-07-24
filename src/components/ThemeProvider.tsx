"use client";

/**
 * src/components/ThemeProvider.tsx
 *
 * Manages the dark / light theme:
 *  - Reads the saved preference from localStorage on first render.
 *  - Falls back to the OS preference (prefers-color-scheme) if nothing saved.
 *  - Applies / removes the "dark" class on <html> without a flash.
 *  - Exposes useTheme() hook so any component can read / toggle the theme.
 *
 * Flash prevention:
 *   A tiny inline <script> (injected by ThemeScript below) runs before React
 *   hydration and applies the saved class immediately — same technique used
 *   by next-themes, shadcn/ui, etc. This component must be rendered inside
 *   <head> or very early in <body>.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue>({
  theme:    "light",
  toggle:   () => {},
  setTheme: () => {},
});

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = "bidii_theme";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe: initialise with a static value; localStorage is read only
  // in useEffect which runs client-side only, preventing SSR/CSR mismatch.
  const [theme, setThemeState] = useState<Theme>("light");

  // On mount: read saved preference or OS preference.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved: Theme = saved ?? (prefersDark ? "dark" : "light");
    applyTheme(resolved);
    setThemeState(resolved);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ---------------------------------------------------------------------------
// Apply helper — adds/removes "dark" on <html>, briefly suppresses
// transitions so the switch is instant rather than animating.
// ---------------------------------------------------------------------------

function applyTheme(theme: Theme) {
  const html = document.documentElement;

  // Suppress transitions during the class swap to avoid a colour flash.
  html.classList.add("no-transitions");

  if (theme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }

  // Re-enable transitions on the next animation frame.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      html.classList.remove("no-transitions");
    });
  });
}

// ---------------------------------------------------------------------------
// ThemeScript — inline script injected into <head> to prevent flash.
// Render this as a Server Component inside <head> in layout.tsx.
// ---------------------------------------------------------------------------

/**
 * Inline script that runs before React hydration to apply the saved theme
 * class immediately. Prevents the white → dark flash on page load.
 *
 * Usage in layout.tsx:
 *   <head>
 *     <ThemeScript />
 *   </head>
 */
export function ThemeScript() {
  const script = `
(function(){
  try {
    var t = localStorage.getItem('bidii_theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (t === 'dark' || (!t && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`.trim();

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
