"use client";

import { PageHeader } from "@/components/ui";
import CalendarView from "@/components/CalendarView";

export default function TeacherCalendarPage() {
  return (
    <div>
      <PageHeader
        title="School Calendar"
        description="Kenya's public holidays and school events, read-only."
      />
      <CalendarView canManage={false} />
    </div>
  );
}
