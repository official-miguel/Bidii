import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import MustChangePasswordGate from "@/components/MustChangePasswordGate";

export default async function PrincipalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== "PRINCIPAL") {
    redirect("/login");
  }

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { name: true },
  });

  return (
    <MustChangePasswordGate mustChangePassword={user.mustChangePassword}>
      <DashboardShell
        role="principal"
        roleLabel="Principal"
        userEmail={user.email}
        schoolName={school?.name}
        // visibleHubs undefined → all hubs (principal sees everything)
      >
        {children}
      </DashboardShell>
    </MustChangePasswordGate>
  );
}
