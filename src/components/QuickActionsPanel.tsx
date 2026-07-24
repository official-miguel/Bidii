"use client";

/**
 * src/components/QuickActionsPanel.tsx
 *
 * A slide-down panel of the most frequent actions for the current role.
 * Accessible from the ⚡ button in TopAppBar.
 *
 * Actions are role-filtered from ACTIONS_REGISTRY + a curated
 * "top 8 for this role" selection so the panel never feels overwhelming.
 * Clicking any action navigates immediately and closes the panel.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Zap, X } from "lucide-react";
import { ACTIONS_REGISTRY, NAV_REGISTRY } from "@/lib/hooks/useGlobalSearch";
import { useProductivityStore } from "@/lib/stores/productivityStore";
import { getLucideIcon } from "@/lib/utils/lucideIcon";

// useProductivityStore is accessed via .getState() in callbacks to avoid
// subscribing to unstable function references that would cause infinite loops.

// ---------------------------------------------------------------------------
// Role-ordered action priority lists
// Only the first PANEL_MAX_ACTIONS are shown.
// ---------------------------------------------------------------------------

const PANEL_MAX_ACTIONS = 8;

const ROLE_PRIORITY: Record<string, string[]> = {
  principal: [
    "qa_add_student",
    "qa_add_staff",
    "qa_take_attendance",
    "qa_create_exam",
    "qa_view_reports",
    "qa_send_message",
    "qa_issue_book",
    "qa_allocate_dorm",
    "qa_record_result",
  ],
  teacher: [
    "qa_take_attendance",
    "qa_record_result",
    "qa_add_student",
  ],
  staff: [
    "qa_add_student",
    "qa_issue_book",
    "qa_send_message",
    "qa_take_attendance",
  ],
};

// Nav shortcuts shown below the actions grid
const NAV_SHORTCUTS_PER_ROLE: Record<string, string[]> = {
  principal: ["nav_students", "nav_classes", "nav_reports", "nav_accommodation", "nav_calendar", "nav_settings"],
  teacher:   ["nav_attendance", "nav_assessments", "nav_results", "nav_calendar"],
  staff:     ["nav_students", "nav_communication", "nav_library", "nav_calendar"],
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
  role: string;
}

export default function QuickActionsPanel({ isOpen, onClose, role }: Props) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  // Close on Esc
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Build ordered action list for this role
  const priority = ROLE_PRIORITY[role] ?? [];
  const allRoleActions = ACTIONS_REGISTRY.filter((a) => a.roles.includes(role));

  const orderedActions = [
    ...priority
      .map((id) => allRoleActions.find((a) => a.id === id))
      .filter(Boolean),
    ...allRoleActions.filter((a) => !priority.includes(a.id)),
  ].slice(0, PANEL_MAX_ACTIONS) as typeof allRoleActions;

  // Nav shortcuts
  const navIds = NAV_SHORTCUTS_PER_ROLE[role] ?? [];
  const navShortcuts = navIds
    .map((id) => NAV_REGISTRY.find((n) => n.id === id))
    .filter(Boolean) as typeof NAV_REGISTRY;

  function navigate(href: string, label: string, icon: string) {
    const resolved = href.replace("{role}", role);
    useProductivityStore.getState().trackVisit({ href: resolved, label, icon });
    router.push(resolved);
    onClose();
  }

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Quick actions"
      className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)]
                 rounded-xl bg-white border border-line shadow-xl z-50
                 dark:bg-dark-surface dark:border-dark-border
                 animate-scale-in origin-top-right"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3
                      border-b border-line dark:border-dark-border">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-teal" />
          <h2 className="text-sm font-semibold text-ink dark:text-dark-text">
            Quick Actions
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick actions"
          className="w-7 h-7 flex items-center justify-center rounded-md
                     text-slate hover:bg-paper transition-colors
                     dark:text-dark-muted dark:hover:bg-dark-border"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Action grid ─────────────────────────────────────────────── */}
      <div className="p-3 grid grid-cols-2 gap-2">
        {orderedActions.map((action) => {
          const Icon = getLucideIcon(action.icon);

          return (
            <button
              key={action.id}
              type="button"
              onClick={() => navigate(action.href, action.label, action.icon)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg
                         text-left border border-line transition-colors
                         hover:border-teal/40 hover:bg-teal-50 group
                         dark:border-dark-border dark:hover:border-teal/40 dark:hover:bg-teal-900/10"
            >
              <div
                className="shrink-0 w-8 h-8 rounded-md bg-teal/10 text-teal
                           flex items-center justify-center
                           group-hover:bg-teal group-hover:text-white transition-colors"
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </div>
              <span className="text-xs font-medium text-ink leading-tight dark:text-dark-text">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Nav shortcuts ────────────────────────────────────────────── */}
      {navShortcuts.length > 0 && (
        <div className="border-t border-line dark:border-dark-border">
          <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold text-slate
                        uppercase tracking-wider dark:text-dark-muted">
            Go to
          </p>
          <div className="px-3 pb-3 flex flex-wrap gap-1.5">
            {navShortcuts.map((nav) => {
              const Icon = getLucideIcon(nav.icon);

              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => navigate(nav.href, nav.label, nav.icon)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                             text-xs text-slate border border-line
                             hover:bg-paper hover:text-ink transition-colors
                             dark:text-dark-muted dark:border-dark-border
                             dark:hover:bg-dark-border dark:hover:text-dark-text"
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {nav.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger button — renders in TopAppBar
// ---------------------------------------------------------------------------

export function QuickActionsButton({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quick actions"
      aria-expanded={isOpen}
      title="Quick Actions"
      className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors
                  ${isOpen
                    ? "bg-teal-50 text-teal dark:bg-teal-900/20 dark:text-teal"
                    : "text-slate hover:bg-teal-50 hover:text-teal dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
                  }`}
    >
      <Zap className="h-4.5 w-4.5" />
    </button>
  );
}
