"use client";

/**
 * src/components/Sidebar.tsx
 *
 * Full-width sidebar — used in layouts that need a wider nav panel
 * (e.g. staff / parent portals). Includes sync status, theme toggle,
 * and sign-out with offline data cleanup.
 *
 * For the principal / teacher hub shell, use HubSidebar instead.
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface SidebarProps {
  userEmail: string;
  roleLabel: string;
  userInitials: string;
  schoolName?: string;
  /** Base role prefix for links (e.g. "staff", "parent") */
  role?: string;
  navItems?: NavItem[];
}

export default function Sidebar({
  userEmail,
  roleLabel,
  userInitials,
  schoolName,
  navItems = [],
}: SidebarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      aria-label="Sidebar navigation"
      className="flex flex-col h-full w-64 bg-white border-r border-line
                 dark:bg-dark-sidebar dark:border-dark-border"
    >
      {/* ── Logo / school name ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 h-16 px-4 shrink-0
                      border-b border-line dark:border-dark-border">
        <div className="h-8 w-8 rounded overflow-hidden shrink-0">
          <Image
            src="/logo.png"
            alt="Bidii KE"
            width={32}
            height={32}
            className="object-contain"
          />
        </div>
        <span className="font-semibold text-sm text-ink dark:text-dark-text truncate">
          {schoolName ?? "Bidii"}
        </span>
      </div>

      {/* ── Navigation links ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm
                       text-slate hover:bg-teal-50 hover:text-teal
                       transition-colors dark:text-dark-muted
                       dark:hover:bg-dark-border dark:hover:text-dark-text"
          >
            {item.icon && (
              <span className="shrink-0 h-4 w-4" aria-hidden="true">
                {item.icon}
              </span>
            )}
            {item.label}
          </Link>
        ))}
      </nav>

      {/* ── Theme toggle ────────────────────────────────────────────────── */}
      <div className="px-2 pb-1">
        <ThemeToggle />
      </div>

      {/* ── User info + sign-out ────────────────────────────────────────── */}
      <div className="border-t border-line dark:border-dark-border p-3">
        <div className="flex items-center gap-3 mb-2 px-1">
          <div
            className="w-8 h-8 rounded-full bg-teal text-white text-xs font-semibold
                       flex items-center justify-center select-none shrink-0"
          >
            {userInitials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink dark:text-dark-text truncate">
              {roleLabel}
            </p>
            <p className="text-[11px] text-slate dark:text-dark-muted truncate">
              {userEmail}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2
                     text-sm text-slate hover:bg-danger/5 hover:text-danger
                     transition-colors dark:text-dark-muted dark:hover:text-danger
                     min-h-[44px]"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
