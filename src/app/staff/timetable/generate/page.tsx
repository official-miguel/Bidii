"use client";

import ContextNavigation from "@/components/ContextNavigation";
import { getTimetableNav } from "@/lib/timetable/navItems";
import TimetableGenerate from "@/components/timetable/TimetableGenerate";

export default function StaffTimetableGeneratePage() {
  return (
    <div>
      <ContextNavigation items={getTimetableNav("/staff/timetable")} />
      <TimetableGenerate basePath="/staff/timetable" />
    </div>
  );
}
