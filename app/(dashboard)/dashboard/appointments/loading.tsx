import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function AppointmentsLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="gonix-card-premium p-6 grid grid-cols-7 gap-3">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
