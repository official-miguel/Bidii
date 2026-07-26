import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import UnifiedDashboard from "@/components/dashboard/UnifiedDashboard";

export default async function PrincipalDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <UnifiedDashboard user={user} rolePrefix="principal" />;
}
