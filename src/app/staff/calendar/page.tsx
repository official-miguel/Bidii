import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import CalendarView from "@/components/CalendarView";

export default async function StaffCalendarPage() {
  const user = await getCurrentUser();
  const perms = await getEffectivePermissions(user!);
  if (!perms.CALENDAR?.canView) redirect("/staff");

  return (
    <div>
      <PageHeader
        title="School Calendar"
        description={
          perms.CALENDAR.canManage
            ? "Kenya's public holidays are shown automatically. Add school-specific events like exams, meetings, and breaks."
            : "Kenya's public holidays and school events, read-only."
        }
      />
      <CalendarView canManage={!!perms.CALENDAR.canManage} />
    </div>
  );
}
