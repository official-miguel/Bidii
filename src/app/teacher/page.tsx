import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardVariant } from "@/lib/permissions";
import SubjectTeacherDashboard  from "@/components/dashboard/SubjectTeacherDashboard";
import ClassTeacherDashboard    from "@/components/dashboard/ClassTeacherDashboard";
import HODDashboard             from "@/components/dashboard/HODDashboard";

export default async function TeacherPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const variant = await getDashboardVariant(user);

  if (variant === "hod")          return <HODDashboard user={user} />;
  if (variant === "class_teacher") return <ClassTeacherDashboard user={user} rolePrefix="teacher" />;
  return <SubjectTeacherDashboard user={user} />;
}
