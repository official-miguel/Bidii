import { PageHeader } from "@/components/ui";
import AchievementsDashboard from "@/components/records/AchievementsDashboard";

export const metadata = { title: "Achievements — Records" };

export default function PrincipalAchievementsPage() {
  return (
    <div>
      <PageHeader
        title="Achievements"
        description="Celebrate student excellence. Record and browse achievements across sports, academics, leadership, and more."
      />
      <AchievementsDashboard canManage={true} />
    </div>
  );
}
