import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import UnifiedDashboard from "@/components/dashboard/UnifiedDashboard";

export default async function TeacherPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  return <UnifiedDashboard user={user} rolePrefix="teacher" />;
}
