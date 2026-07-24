import { SkeletonBar, SkeletonCard } from "@/components/ui/ProgressivePage";

export default function ParentLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBar height="2rem" width="10rem" />
      <SkeletonBar height="1rem" width="18rem" />
      <div className="mt-6 space-y-3">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
      </div>
    </div>
  );
}
