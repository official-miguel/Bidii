import { PageHeader } from "@/components/ui";
import DisciplineDashboard from "@/components/records/DisciplineDashboard";

export const metadata = { title: "Discipline — Records" };

export default function PrincipalDisciplinePage() {
  return (
    <div>
      <PageHeader
        title="Discipline"
        description="Track and manage student discipline cases. Record incidents, monitor status, and keep detailed case notes."
      />
      <DisciplineDashboard
        canManage={true}
        caseHrefBase="/principal/records/discipline"
      />
    </div>
  );
}
