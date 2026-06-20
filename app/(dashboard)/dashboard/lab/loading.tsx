import { Skeleton, PageHeaderSkeleton, StatSkeleton } from "@/components/ui/skeleton";

export default function LabLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {Array.from({ length: 3 }).map((_, i) => <StatSkeleton key={i} />)}
            </div>
            <div className="gonix-card-premium p-6 space-y-3">
                <Skeleton className="h-5 w-1/3" />
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
        </div>
    );
}
