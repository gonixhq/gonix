import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function AuditLoading() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <Skeleton className="h-10 w-full max-w-md" />
            <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="gonix-card-premium p-4 flex items-start gap-4">
                        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
