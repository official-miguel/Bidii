import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import UnifiedDashboard from "@/components/dashboard/UnifiedDashboard";

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN_STAFF") redirect("/login");

  return <UnifiedDashboard user={user} rolePrefix="staff" />;
}
