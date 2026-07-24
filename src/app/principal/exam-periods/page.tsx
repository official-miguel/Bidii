import { redirect } from "next/navigation";

/**
 * /principal/exam-periods
 *
 * Exam / assessment periods are managed inside the Exams & Analysis module.
 * Redirect to the canonical periods page.
 */
export default function PrincipalExamPeriodsPage() {
  redirect("/principal/assessments/periods");
}
