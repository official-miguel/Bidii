import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardVariant } from "@/lib/permissions";
import DeputyDashboard      from "@/components/dashboard/DeputyDashboard";
import HODDashboard         from "@/components/dashboard/HODDashboard";
import ClassTeacherDashboard from "@/components/dashboard/ClassTeacherDashboard";
import LibrarianDashboard   from "@/components/dashboard/LibrarianDashboard";
import BoardingMasterDashboard from "@/components/dashboard/BoardingMasterDashboard";
import GenericStaffDashboard from "@/components/dashboard/GenericStaffDashboard";

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN_STAFF") redirect("/login");

  const variant = await getDashboardVariant(user);

  switch (variant) {
    case "deputy_principal": return <DeputyDashboard user={user} />;
    case "hod":              return <HODDashboard user={user} />;
    case "class_teacher":    return <ClassTeacherDashboard user={user} rolePrefix="staff" />;
    case "librarian":        return <LibrarianDashboard user={user} />;
    case "boarding_master":  return <BoardingMasterDashboard user={user} />;
    default:                 return <GenericStaffDashboard user={user} />;
  }
}
