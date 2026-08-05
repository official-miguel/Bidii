"use client";

/**
 * /principal/timetable/generate
 */

import ContextNavigation from "@/components/ContextNavigation";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";
import TimetableGenerate from "@/components/timetable/TimetableGenerate";

export default function GeneratePage() {
  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <TimetableGenerate basePath="/principal/timetable" />
    </div>
  );
}
