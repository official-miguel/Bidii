"use client";

/**
 * /principal/timetable — Timetable Hub
 */

import ContextNavigation from "@/components/ContextNavigation";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";
import TimetableDashboard from "@/components/timetable/TimetableDashboard";

export default function TimetableDashboardPage() {
  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <TimetableDashboard basePath="/principal/timetable" />
    </div>
  );
}
