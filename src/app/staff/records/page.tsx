import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";

/**
 * /staff/records → redirect to the first accessible sub-module.
 * Discipline is preferred; falls back to achievements.
 */
export default async function StaffRecordsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  const disc = perms.RECORDS_DISCIPLINE;
  const ach = perms.RECORDS_ACHIEVEMENTS;
  const base = perms.RECORDS;

  const canDiscipline = !!(disc?.canView || base?.canView);
  const canAchievements = !!(ach?.canView || base?.canView);

  if (canDiscipline) redirect("/staff/records/discipline");
  if (canAchievements) redirect("/staff/records/achievements");
  redirect("/staff");
}
