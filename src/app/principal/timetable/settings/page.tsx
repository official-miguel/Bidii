"use client";

/**
 * /principal/timetable/settings
 *
 * Navigation hub for the four timetable configuration sub-pages.
 * All actual configuration has moved to dedicated pages — this page
 * simply provides quick access to each of them.
 */

import Link from "next/link";
import { ChevronRight, Clock, BookOpen, Sun, Layers } from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import { PageHeader } from "@/components/ui";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";

// ── Nav cards config ──────────────────────────────────────────────────────

const SECTIONS = [
  {
    href:        "/principal/timetable/template",
    icon:        Clock,
    accent:      "teal",
    title:       "Day Template",
    description: "Define the school-day format: lesson slots, breaks, lunch, games, and session times. Mon–Fri share a default layout; Saturday and Sunday each get their own independent template when enabled.",
    tags:        ["Lesson slots", "Breaks", "Session times", "Weekend days"],
  },
  {
    href:        "/principal/timetable/requirements",
    icon:        BookOpen,
    accent:      "blue",
    title:       "Requirements",
    description: "Set how many lessons per week each class needs for every subject. Click a Form to bulk-edit all its streams at once, or click an individual stream to override specific subjects.",
    tags:        ["Lessons per week", "Double classes", "Per-stream overrides", "Bulk form edit"],
  },
  {
    href:        "/principal/timetable/preferences",
    icon:        Sun,
    accent:      "amber",
    title:       "Preferences",
    description: "Tell the engine which subjects should be placed in morning, afternoon, or evening sessions. Use natural language ('Mathematics must be in the morning') or set rules manually.",
    tags:        ["Morning / Afternoon", "Hard constraints", "Soft preferences", "Natural language"],
  },
  {
    href:        "/principal/timetable/versions",
    icon:        Layers,
    accent:      "purple",
    title:       "Versions",
    description: "Manage draft and published timetable versions. Clone a version between terms, roll back to a previous published timetable, or archive drafts you no longer need.",
    tags:        ["Drafts", "Published", "Clone", "Roll back"],
  },
] as const;

// ── Accent palette ─────────────────────────────────────────────────────────

const ACCENT: Record<string, { icon: string; ring: string; tag: string }> = {
  teal:   { icon: "bg-teal/10 text-teal",            ring: "hover:border-teal/50 hover:shadow-teal/10",   tag: "bg-teal/8 text-teal" },
  blue:   { icon: "bg-blue-50 text-blue-600",         ring: "hover:border-blue-300 hover:shadow-blue/10",  tag: "bg-blue-50 text-blue-600" },
  amber:  { icon: "bg-amber-50 text-amber-600",       ring: "hover:border-amber-300 hover:shadow-amber/10",tag: "bg-amber-50 text-amber-600" },
  purple: { icon: "bg-purple-50 text-purple-600",     ring: "hover:border-purple-300 hover:shadow-purple/10",tag: "bg-purple-50 text-purple-600" },
};

// ── Component ─────────────────────────────────────────────────────────────

export default function TimetableSettingsPage() {
  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <PageHeader
        title="Timetable Settings"
        description="Everything you need to configure the timetable is here. Select a section to get started."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        {SECTIONS.map((section) => {
          const Icon   = section.icon;
          const colors = ACCENT[section.accent];

          return (
            <Link
              key={section.href}
              href={section.href}
              className={`group flex flex-col gap-4 bg-white border border-line rounded-xl p-5
                transition-all duration-150 shadow-sm hover:shadow-md ${colors.ring}`}
            >
              {/* Icon + title row */}
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors.icon}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
                    <ChevronRight
                      className="h-4 w-4 text-slate/40 shrink-0 transition-transform
                                 group-hover:translate-x-0.5 group-hover:text-slate/70"
                      aria-hidden
                    />
                  </div>
                  <p className="text-xs text-slate mt-1 leading-relaxed">
                    {section.description}
                  </p>
                </div>
              </div>

              {/* Tag pills */}
              <div className="flex flex-wrap gap-1.5">
                {section.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors.tag}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-5 text-xs text-slate/60 text-center">
        Changes made in any section take effect immediately for the next timetable generation.
      </p>
    </div>
  );
}
