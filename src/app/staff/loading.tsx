import { SkeletonBar, SkeletonCard } from "@/components/ui/ProgressivePage";

export default function StaffLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBar height="2rem" width="12rem" />
      <SkeletonBar height="1rem" width="16rem" />
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
