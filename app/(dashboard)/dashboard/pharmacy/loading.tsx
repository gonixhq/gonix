import { Skeleton, PageHeaderSkeleton, RowSkeleton } from "@/components/ui/skeleton";

export default function PharmacyLoading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <PageHeaderSkeleton />
            <div className="gonix-card-premium overflow-hidden">
                {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
            </div>
        </div>
    );
}
