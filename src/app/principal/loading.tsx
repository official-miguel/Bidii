import { SkeletonBar, SkeletonStatCard } from "@/components/ui/ProgressivePage";

export default function PrincipalLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBar height="2rem" width="14rem" />
      <SkeletonBar height="1rem" width="18rem" />
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <SkeletonBar height="8rem" className="mt-6 rounded-xl" />
      <SkeletonBar height="8rem" className="rounded-xl" />
    </div>
  );
}
