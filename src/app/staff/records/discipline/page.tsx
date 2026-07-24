import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions, requireRecordsPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import DisciplineDashboard from "@/components/records/DisciplineDashboard";

export const metadata = { title: "Discipline — Records" };

export default async function StaffDisciplinePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const perms = await getEffectivePermissions(user);
  const disc = perms.RECORDS_DISCIPLINE;
  const base = perms.RECORDS;

  const canView = !!(disc?.canView || base?.canView);
  if (!canView) redirect("/staff/records");

  // Gate with the same helper the API route uses
  const gated = await requireRecordsPermission("RECORDS_DISCIPLINE", "view");
  if (!gated) redirect("/staff/records");

  const canManage = !!(disc?.canManage || base?.canManage);

  return (
    <div>
      <PageHeader
        title="Discipline"
        description="Track and manage student discipline cases. Record incidents, monitor status, and keep detailed case notes."
      />
      <DisciplineDashboard canManage={canManage} />
    </div>
  );
}
