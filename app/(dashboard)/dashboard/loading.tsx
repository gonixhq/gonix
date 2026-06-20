import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium p-4 space-y-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-8 w-1/3" />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium p-4 space-y-3 min-h-[200px]">
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
