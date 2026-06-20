import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function StaffLoading() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-32 rounded-xl" />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium p-5 space-y-3">
                        <div className="flex items-start gap-3">
                            <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        </div>
                        <Skeleton className="h-8 w-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
