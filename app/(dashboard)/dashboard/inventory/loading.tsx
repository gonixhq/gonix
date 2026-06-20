import { Skeleton, PageHeaderSkeleton, RowSkeleton } from "@/components/ui/skeleton";

export default function InventoryLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <Skeleton className="h-12 w-full max-w-md" />
            <div className="gonix-card-premium overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}
            </div>
        </div>
    );
}
