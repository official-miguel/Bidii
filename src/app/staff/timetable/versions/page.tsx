"use client";
import ContextNavigation from "@/components/ContextNavigation";
import { getTimetableNav } from "@/lib/timetable/navItems";
import TimetableSettings from "@/components/timetable/TimetableSettings";
export default function StaffTimetableVersionsPage() {
  return (
    <div>
      <ContextNavigation items={getTimetableNav("/staff/timetable")} />
      <TimetableSettings basePath="/staff/timetable" />
    </div>
  );
}
