import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TeacherHome from "@/components/assessment/TeacherHome";

export default async function TeacherAssessmentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink dark:text-dark-text">Exams &amp; Analysis</h1>
        <p className="text-sm text-slate mt-0.5 dark:text-dark-muted">
          Your assignments, marks progress, and class performance for the current period.
        </p>
      </div>
      <TeacherHome />
    </div>
  );
}
