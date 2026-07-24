import { redirect } from "next/navigation";

/**
 * /teacher/results/slips
 *
 * Class result slips are report cards in the assessments module.
 * Redirect to the teacher report-cards page.
 */
export default function TeacherResultSlipsPage() {
  redirect("/teacher/assessments/report-cards");
}
