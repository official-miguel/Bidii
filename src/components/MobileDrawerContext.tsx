"use client";

/**
 * MobileDrawerContext — shares drawer open/close state across the shell.
 *
 * TopAppBar owns the hamburger trigger; HubSidebar renders the drawer.
 * Both live inside the role layout but are siblings, so we use context
 * rather than prop-drilling through a server component.
 *
 * The context is provided by MobileDrawerProvider, which is inserted into
 * every role layout wrapper.  Because Next.js App Router server components
 * cannot themselves be context providers, the provider is a thin "use client"
 * wrapper that each layout imports.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface MobileDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MobileDrawerContext = createContext<MobileDrawerContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function MobileDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open   = useCallback(() => setIsOpen(true),  []);
  const close  = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  return (
    <MobileDrawerContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </MobileDrawerContext.Provider>
  );
}

export function useMobileDrawer() {
  return useContext(MobileDrawerContext);
}
