import { Skeleton, PageHeaderSkeleton, StatSkeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium p-6 space-y-3">
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
