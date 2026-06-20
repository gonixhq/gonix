import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function DoctorStationLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border-2 border-slate-200/60 bg-slate-50/40 p-4 space-y-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-8 w-1/3" />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium p-5 space-y-3">
                        <div className="flex items-start justify-between">
                            <div className="space-y-2 flex-1">
                                <Skeleton className="h-5 w-2/3" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                            <Skeleton className="h-6 w-20 rounded-md" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <div className="grid grid-cols-5 gap-2">
                            {Array.from({ length: 5 }).map((_, j) => (
                                <Skeleton key={j} className="h-12" />
                            ))}
                        </div>
                        <Skeleton className="h-8 w-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
