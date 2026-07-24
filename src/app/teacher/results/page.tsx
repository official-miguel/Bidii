import { redirect } from "next/navigation";

/**
 * /teacher/results
 *
 * Results entry lives inside the Exams & Analysis module.
 * Redirect to the mark-sheet which is the canonical entry point.
 */
export default function TeacherResultsPage() {
  redirect("/teacher/assessments/marksheet");
}
