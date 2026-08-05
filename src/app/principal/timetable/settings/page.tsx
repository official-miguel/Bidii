"use client";

/**
 * /principal/timetable/settings
 */

import ContextNavigation from "@/components/ContextNavigation";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";
import TimetableSettings from "@/components/timetable/TimetableSettings";

export default function TimetableSettingsPage() {
  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <TimetableSettings basePath="/principal/timetable" />
    </div>
  );
}
