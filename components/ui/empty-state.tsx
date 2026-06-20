import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon: LucideIcon | React.ElementType;
    title: string;
    description?: string;
    action?: React.ReactNode;
    variant?: "default" | "dashed" | "minimal";
    className?: string;
}

/**
 * Unified empty-state component.
 * Use anywhere a list/table/section is empty.
 *
 * Variants:
 *  - default: white card with subtle shadow
 *  - dashed:  2px dashed border (good for "add first item")
 *  - minimal: no card, just centered content (for inside existing cards)
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    variant = "default",
    className,
}: EmptyStateProps) {
    const wrapper = {
        default: "gonix-card-premium",
        dashed: "rounded-2xl border-2 border-dashed border-slate-200 bg-white/40",
        minimal: "",
    }[variant];

    return (
        <div className={cn(wrapper, "p-10 text-center", className)}>
            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Icon className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="font-bold text-slate-700 mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-slate-500 max-w-sm mx-auto">{description}</p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
