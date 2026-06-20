import { Skeleton, PageHeaderSkeleton, StatSkeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 3 }).map((_, i) => <StatSkeleton key={i} />)}
            </div>
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200/60 bg-slate-50/40">
                    <Skeleton className="h-4 w-1/4" />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0">
                        <Skeleton className="h-4 w-1/4" />
                        <Skeleton className="h-4 w-1/3 ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    );
}
