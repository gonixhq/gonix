import { Skeleton, PageHeaderSkeleton, StatSkeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
            </div>

            {/* Chart + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 gonix-card-premium p-6 space-y-4">
                    <Skeleton className="h-5 w-1/3" />
                    <div className="h-56 flex items-end gap-3">
                        {Array.from({ length: 7 }).map((_, i) => (
                            <Skeleton key={i} className="flex-1" style={{ height: `${30 + Math.random() * 70}%` }} />
                        ))}
                    </div>
                </div>
                <div className="gonix-card-premium p-6 space-y-3">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                </div>
            </div>

            {/* Queue + Appointments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200/60 bg-slate-50/40">
                            <Skeleton className="h-4 w-1/3" />
                        </div>
                        <div>
                            {Array.from({ length: 4 }).map((_, j) => (
                                <div key={j} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0">
                                    <Skeleton className="h-3 w-12" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-4 w-2/3" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
