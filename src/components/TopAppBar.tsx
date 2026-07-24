"use client";

/**
 * src/components/TopAppBar.tsx
 *
 * Fixed global top bar — Stage 9 updated.
 *
 * Changes vs Stage 8:
 *   - Hamburger menu button (mobile only, left edge) opens MobileDrawer via
 *     MobileDrawerContext — no bottom nav bar any more.
 *   - All icon buttons enlarged to 44px tap targets (w-11 h-11).
 *   - Desktop search pill and profile chip remain unchanged.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Sun, Moon, ChevronDown, LogOut, Menu, Sparkles } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useMobileDrawer } from "@/components/MobileDrawerContext";
import GlobalSearchModal from "@/components/GlobalSearchModal";
import NotificationCenter, { NotificationBell } from "@/components/NotificationCenter";
import QuickActionsPanel, { QuickActionsButton } from "@/components/QuickActionsPanel";
import { useSomaAI } from "@/components/SomaAIProvider";
import { useSomaAIStore } from "@/lib/soma-ai/store";

export interface QuickAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

interface Props {
  userEmail: string;
  roleLabel: string;
  userInitials: string;
  schoolName?: string;
  /** Routing role prefix: "principal" | "teacher" | "staff" | "parent" */
  role?: string;
  /** Legacy per-layout quick actions — kept for backward compat */
  quickActions?: QuickAction[];
}

export default function TopAppBar({
  userEmail,
  roleLabel,
  userInitials,
  schoolName,
  role = "principal",
  quickActions: _quickActions = [],
}: Props) {
  const { theme, toggle }      = useTheme();
  const { toggle: toggleDrawer } = useMobileDrawer();
  const router = useRouter();
  const { isOpen: somaOpen, toggle: toggleSoma } = useSomaAI();
  const somaStreaming = useSomaAIStore((s) => s.isStreaming);
  const [searchOpen,       setSearchOpen]       = useState(false);
  const [notifOpen,        setNotifOpen]        = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [profileOpen,      setProfileOpen]      = useState(false);

  const profileRef      = useRef<HTMLDivElement>(null);
  const notifRef        = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  /* ── Keyboard shortcuts ─────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setNotifOpen(false);
        setQuickActionsOpen(false);
        setProfileOpen(false);
        return;
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setQuickActionsOpen(false);
        setProfileOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Profile dropdown outside-click ─────────────────────────────────── */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  /* ── Mutual exclusion ───────────────────────────────────────────────── */
  function openNotif() {
    setNotifOpen((v) => !v);
    setQuickActionsOpen(false);
    setProfileOpen(false);
  }

  function openQuickActions() {
    setQuickActionsOpen((v) => !v);
    setNotifOpen(false);
    setProfileOpen(false);
  }

  function openProfile() {
    setProfileOpen((v) => !v);
    setNotifOpen(false);
    setQuickActionsOpen(false);
  }

  function openSoma() {
    toggleSoma();
    setNotifOpen(false);
    setQuickActionsOpen(false);
    setProfileOpen(false);
  }

  async function handleLogout() {
    setProfileOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isDark = theme === "dark";

  // Shared icon-button class — 44px tap target on all viewports
  const iconBtn = `flex items-center justify-center w-11 h-11 rounded-lg
                   transition-colors duration-100
                   text-slate hover:bg-teal-50 hover:text-teal
                   dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text`;

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 right-0 z-30 h-16 flex items-center gap-1 px-2 sm:px-4
                   bg-white/95 backdrop-blur-sm border-b border-line
                   dark:bg-dark-sidebar/95 dark:border-dark-border
                   md:left-16 left-0"
      >
        {/* ── Hamburger (mobile only) ─────────────────────────────────── */}
        <button
          type="button"
          onClick={toggleDrawer}
          aria-label="Open navigation menu"
          className={`md:hidden ${iconBtn}`}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* ── Mobile logo / school name ───────────────────────────────── */}
        <div className="md:hidden flex items-center gap-2 mx-1">
          <div className="h-7 w-7 rounded overflow-hidden shrink-0">
            <Image
              src="/logo.png"
              alt="Bidii KE"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          <span className="font-semibold text-sm text-ink dark:text-dark-text truncate max-w-[140px] xs:max-w-[180px]">
            {schoolName ?? "Bidii"}
          </span>
        </div>

        {/* ── Search trigger (desktop pill) ───────────────────────────── */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 h-9 pl-3 pr-4 rounded-lg
                     bg-paper border border-line text-slate text-sm
                     hover:border-teal/40 hover:text-ink transition-colors
                     dark:bg-dark-surface dark:border-dark-border
                     dark:text-dark-muted dark:hover:text-dark-text"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">Search…</span>
          <kbd className="ml-3 text-[10px] font-medium text-slate/60 bg-line
                          rounded px-1.5 py-0.5 dark:bg-dark-border dark:text-dark-muted">
            ⌘K
          </kbd>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── Mobile search icon ──────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className={`md:hidden ${iconBtn}`}
        >
          <Search className="h-5 w-5" />
        </button>

        {/* ── Theme toggle ─────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={toggle}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className={iconBtn}
        >
          {isDark
            ? <Sun  className="h-[18px] w-[18px]" />
            : <Moon className="h-[18px] w-[18px]" />}
        </button>

        {/* ── Soma AI ──────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={openSoma}
          aria-label={somaOpen ? "Close Soma AI" : "Open Soma AI"}
          aria-expanded={somaOpen}
          aria-haspopup="dialog"
          className={`relative ${iconBtn} ${somaOpen ? "bg-teal/10 text-teal dark:bg-teal/20 dark:text-teal-light" : ""}`}
        >
          <Sparkles className="h-[18px] w-[18px]" />
          {/* Streaming activity dot */}
          {somaStreaming && (
            <span
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-teal
                         animate-soma-pulse"
              aria-hidden="true"
            />
          )}
        </button>

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <div ref={quickActionsRef} className="relative">
          <QuickActionsButton
            onClick={openQuickActions}
            isOpen={quickActionsOpen}
          />
          <QuickActionsPanel
            isOpen={quickActionsOpen}
            onClose={() => setQuickActionsOpen(false)}
            role={role}
          />
        </div>

        {/* ── Notifications ────────────────────────────────────────────── */}
        <div ref={notifRef} className="relative">
          <NotificationBell
            onClick={openNotif}
            isOpen={notifOpen}
          />
          <NotificationCenter
            isOpen={notifOpen}
            onClose={() => setNotifOpen(false)}
          />
        </div>

        {/* ── User profile ─────────────────────────────────────────────── */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={openProfile}
            aria-expanded={profileOpen}
            aria-haspopup="true"
            className="flex items-center gap-2 h-11 pl-1 pr-2.5 rounded-lg
                       hover:bg-teal-50 transition-colors group
                       dark:hover:bg-dark-border"
          >
            <div
              className="w-8 h-8 rounded-full bg-teal text-white text-xs font-semibold
                         flex items-center justify-center select-none shrink-0"
            >
              {userInitials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-ink leading-none dark:text-dark-text">
                {roleLabel}
              </p>
            </div>
            <ChevronDown
              className={`hidden sm:block h-3 w-3 text-slate transition-transform duration-150
                         dark:text-dark-muted ${profileOpen ? "rotate-180" : ""}`}
            />
          </button>

          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-56 rounded-xl
                         bg-white border border-line shadow-lg
                         dark:bg-dark-surface dark:border-dark-border
                         animate-scale-in origin-top-right z-50"
            >
              <div className="px-4 py-3 border-b border-line dark:border-dark-border">
                <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                  {roleLabel}
                </p>
                <p className="text-xs text-slate dark:text-dark-muted truncate mt-0.5">
                  {userEmail}
                </p>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5
                             text-sm text-slate hover:bg-danger/5 hover:text-danger
                             transition-colors dark:text-dark-muted dark:hover:text-danger
                             min-h-[44px]"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Global Search Modal ──────────────────────────────────────────── */}
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        role={role}
      />
    </>
  );
}
