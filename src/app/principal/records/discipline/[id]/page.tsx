import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import DisciplineCaseClient from "./DisciplineCaseClient";

export default async function DisciplineCasePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/");

  const record = await prisma.disciplineRecord.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          admissionNumber: true,
          schoolClass: { select: { name: true, form: true } },
        },
      },
      recordedBy: { select: { email: true } },
      caseNotes: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { email: true } } },
      },
      events: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { email: true } } } },
      files: {
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!record) notFound();

  return (
    <div>
      <PageHeader
        title={`Discipline Case: ${record.offence}`}
        description={`${record.student.fullName} (${record.student.admissionNumber}) — ${record.student.schoolClass.name}`}
        action={
          <Link href="/principal/records/discipline" className="text-sm text-royal hover:underline">
            ← Back to Discipline
          </Link>
        }
      />

      <DisciplineCaseClient
        record={record}
        initialNotes={record.caseNotes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
        initialEvents={record.events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
        initialFiles={record.files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))}
      />
    </div>
  );
}