import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions, requireRecordsPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import AchievementsDashboard from "@/components/records/AchievementsDashboard";

export const metadata = { title: "Achievements — Records" };

export default async function StaffAchievementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  const ach = perms.RECORDS_ACHIEVEMENTS;
  const base = perms.RECORDS;

  const canView = !!(ach?.canView || base?.canView);
  if (!canView) redirect("/staff/records");

  // Gate with the same helper the API route uses
  const gated = await requireRecordsPermission("RECORDS_ACHIEVEMENTS", "view");
  if (!gated) redirect("/staff/records");

  const canManage = !!(ach?.canManage || base?.canManage);

  return (
    <div>
      <PageHeader
        title="Achievements"
        description="Celebrate student excellence. Record and browse achievements across sports, academics, leadership, and more."
      />
      <AchievementsDashboard canManage={canManage} />
    </div>
  );
}
