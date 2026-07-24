"use client";

import { PageHeader } from "@/components/ui";
import CalendarView from "@/components/CalendarView";
import ContextNavigation from "@/components/ContextNavigation";

export default function PrincipalCalendarPage() {
  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/classes", label: "Classes" },
          { href: "/principal/subjects", label: "Subjects" },
          { href: "/principal/timetable", label: "Timetable" },
          { href: "/principal/attendance", label: "Attendance" },
          { href: "/principal/calendar", label: "Calendar" },
          { href: "/principal/assessments", label: "Exams & Analysis" },
        ]}
      />

      <PageHeader
        title="School Calendar"
        description="Kenya's public holidays are shown automatically. Add school-specific events like exams, meetings, and breaks."
      />

      <CalendarView canManage={true} />
    </div>
  );
}
