"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import OfflineQueueBanner from "./OfflineQueueBanner";

const TABS = [
  { label: "Messages",  icon: "💬", href: (base: string) => base },
  { label: "Groups",    icon: "👥", href: (base: string) => `${base}/groups` },
  { label: "Templates", icon: "📋", href: (base: string) => `${base}/templates` },
];

interface Props {
  base:          string;
  canManage:     boolean;
  children:      React.ReactNode;
  onNewMessage?: () => void;
}

export default function CommunicationShell({ base, canManage, children, onNewMessage }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Communication</h1>
          <p className="text-sm text-slate mt-0.5">Send messages to parents, staff, and custom groups</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`${base}/exam-results`}
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-line text-sm font-medium px-3 py-2 text-ink hover:bg-paper transition-colors"
            >
              <span className="text-base">📊</span>
              <span>Exam Results</span>
            </Link>
            <button
              onClick={onNewMessage}
              className="flex items-center gap-2 rounded-lg bg-royal text-white text-sm font-semibold px-4 py-2.5 hover:bg-royal-light transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
              </svg>
              New Message
            </button>
          </div>
        )}
      </div>

      <OfflineQueueBanner />

      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-0 border-b border-line mb-6">
        {TABS.map((tab) => {
          const href    = tab.href(base);
          const isExact = tab.label === "Messages";
          const active  = isExact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              href={href}
              className={`shrink-0 flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-royal text-royal bg-royal-50/60"
                  : "border-transparent text-slate hover:text-ink hover:bg-paper"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
        {/* Exam Results tab on mobile */}
        {canManage && (
          <Link
            href={`${base}/exam-results`}
            className={`sm:hidden shrink-0 flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              pathname.startsWith(`${base}/exam-results`)
                ? "border-royal text-royal bg-royal-50/60"
                : "border-transparent text-slate hover:text-ink hover:bg-paper"
            }`}
          >
            <span className="text-base leading-none">📊</span>
            Results
          </Link>
        )}
      </div>

      {children}
    </div>
  );
}
