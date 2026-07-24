import { redirect } from "next/navigation";

/**
 * /principal/results
 *
 * Results entry and report cards live inside the Exams & Analysis module.
 * Redirect to the assessments marksheet which is the canonical entry point.
 */
export default function PrincipalResultsPage() {
  redirect("/principal/assessments/marksheet");
}
