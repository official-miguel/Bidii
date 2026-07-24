import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Home page dispatcher — redirects authenticated users to their role-specific dashboard.
 *
 * Route tree:
 *  - PRINCIPAL     → /principal
 *  - TEACHER       → /teacher
 *  - ADMIN_STAFF   → /staff
 *  - PARENT/STUDENT → /parent
 *  - (no session)  → /login
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  switch (user.role) {
    case "PRINCIPAL":
      redirect("/principal");
    case "TEACHER":
      redirect("/teacher");
    case "ADMIN_STAFF":
      redirect("/staff");
    case "PARENT":
    case "STUDENT":
      redirect("/parent");
    default:
      // Fallback for any other roles (WATCHMAN, MARKER, etc.)
      redirect("/login");
  }
}
