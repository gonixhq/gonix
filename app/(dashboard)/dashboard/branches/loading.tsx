import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function BranchesLoading() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium p-6 space-y-3">
                        <div className="flex items-start justify-between">
                            <Skeleton className="h-5 w-16 rounded-md" />
                            <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-6 w-24 rounded-md" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                ))}
            </div>
        </div>
    );
}
