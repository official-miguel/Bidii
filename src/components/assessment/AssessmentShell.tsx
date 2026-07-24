"use client";

/**
 * Inner-sidebar shell for the Examination & Analysis module.
 *
 * Renders a left nav rail with section links and the page content on the
 * right. Used by both the principal and teacher assessment overview pages so
 * both roles get the same split-pane UX when they click "Exams & Analysis".
 *
 * On mobile the nav collapses to two stacked horizontal scrollable strips:
 *   1. contextNav  — broader academics context (Classes / Subjects / …)  ← top
 *   2. inner nav   — module sections (Overview / Mark Sheets / …)         ← below
 * Both strips are sticky so they travel together as the user scrolls.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AssessmentNavItem {
  href: string;
  label: string;
  icon: string;
  /** If true, only matches this exact path (not children). */
  exact?: boolean;
}

interface Props {
  navItems: AssessmentNavItem[];
  children: React.ReactNode;
  /**
   * Optional context-level navigation rendered as the FIRST (top) strip on
   * mobile — above the module inner-nav. Pass a <ContextNavigation /> node
   * from the layout so it always appears regardless of which sub-page is
   * active.
   */
  contextNav?: React.ReactNode;
}

export default function AssessmentShell({ navItems, children, contextNav }: Props) {
  const pathname = usePathname();

  function isActive(item: AssessmentNavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/") || pathname.startsWith(item.href + "?");
  }

  return (
    <div className="flex gap-0 min-h-[calc(100vh-64px)]">
      {/* ── Inner sidebar — desktop ── */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-line
                        bg-paper/60 py-4 px-2 gap-0.5 sticky top-16 self-start
                        max-h-[calc(100vh-4rem)] overflow-y-auto
                        dark:bg-dark-bg/60 dark:border-dark-border">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-100 ${
                active
                  ? "bg-teal text-white font-medium shadow-xs"
                  : "text-slate hover:bg-teal-50 hover:text-teal dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
              }`}
            >
              <span className="text-base leading-none w-5 text-center shrink-0" aria-hidden="true">
                {item.icon}
              </span>
              <span className="leading-snug">{item.label}</span>
            </Link>
          );
        })}
      </aside>

      {/* ── Mobile: two stacked sticky strips + page content ── */}
      <div className="md:hidden w-full">
        {/* Strip 1 — context nav (Classes / Subjects / …) */}
        {contextNav && (
          <div className="sticky top-16 z-20 bg-paper/95 border-b border-line
                          dark:bg-dark-bg/95 dark:border-dark-border
                          overflow-x-auto scrollbar-none px-3 pt-2 pb-0">
            {contextNav}
          </div>
        )}

        {/* Strip 2 — module inner nav (Overview / Mark Sheets / …) */}
        <div className={`flex overflow-x-auto gap-1 px-3 py-2 border-b border-line
                        bg-paper/80 scrollbar-none
                        dark:bg-dark-bg/80 dark:border-dark-border
                        ${contextNav ? "sticky top-[calc(4rem+40px)] z-10" : "sticky top-16 z-10"}`}>
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5
                            text-xs font-medium transition-colors duration-100 whitespace-nowrap ${
                  active
                    ? "bg-teal text-white shadow-xs"
                    : "bg-white border border-line text-slate hover:border-teal/40 hover:text-teal dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted dark:hover:border-teal/30"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Page content */}
        <div className="px-4 py-5">{children}</div>
      </div>

      {/* ── Page content — desktop ── */}
      <div className="hidden md:block flex-1 min-w-0 px-6 py-5">
        {children}
      </div>
    </div>
  );
}
