import { cn } from "@/lib/utils";

/**
 * Shimmer skeleton block.
 * Use as building block for loading states.
 */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
    return (
        <div
            style={style}
            className={cn(
                "relative overflow-hidden rounded-xl bg-slate-200/70",
                "before:absolute before:inset-0 before:-translate-x-full",
                "before:animate-[shimmer-slide_1.4s_infinite] before:bg-gradient-to-r",
                "before:from-transparent before:via-white/60 before:to-transparent",
                className
            )}
        />
    );
}

/**
 * Premium card skeleton — matches gonix-card-premium dimensions.
 */
export function CardSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
    return (
        <div className={cn("gonix-card-premium p-5 space-y-3", className)}>
            <Skeleton className="h-5 w-1/3" />
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} className={i === lines - 1 ? "h-4 w-2/3" : "h-4 w-full"} />
            ))}
        </div>
    );
}

/**
 * Row skeleton (for tables / lists).
 */
export function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 last:border-0">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
        </div>
    );
}

/**
 * Stat card skeleton.
 */
export function StatSkeleton() {
    return (
        <div className="gonix-card-premium p-5 space-y-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
        </div>
    );
}

/**
 * Page header skeleton.
 */
export function PageHeaderSkeleton() {
    return (
        <div className="flex items-center gap-4 pt-2">
            <Skeleton className="h-14 w-14 rounded-2xl shrink-0" />
            <div className="space-y-2 flex-1">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
            </div>
        </div>
    );
}
