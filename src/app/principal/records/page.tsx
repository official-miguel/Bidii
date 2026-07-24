import { redirect } from "next/navigation";

/**
 * /principal/records → redirect to the Discipline sub-module.
 * The layout wrapping this route renders the Discipline | Achievements tab strip,
 * so the redirect lands the user straight on the first tab.
 */
export default function RecordsIndexPage() {
  redirect("/principal/records/discipline");
}
