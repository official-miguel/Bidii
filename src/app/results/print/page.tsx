import { redirect } from "next/navigation";

/**
 * /results/print — legacy print route.
 * Print routes have moved to /assessments/report-card/print.
 * Forward all query params to the new location.
 */
export default function ResultsPrintPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/assessments/report-card/print${qs ? `?${qs}` : ""}`);
}
