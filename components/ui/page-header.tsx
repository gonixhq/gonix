import { type LucideIcon } from "lucide-react";

interface PageHeaderProps {
    icon: LucideIcon | React.ElementType;
    title: string;
    titleEn?: string;
    description?: string;
    action?: React.ReactNode;
}

/**
 * Unified page header — midnight gradient icon badge + bold title.
 * Use at the top of every dashboard page for consistent identity.
 */
export function PageHeader({ icon: Icon, title, titleEn, description, action }: PageHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center shadow-lg shadow-slate-900/30 ring-1 ring-white/10 shrink-0">
                    <Icon className="h-5 w-5 text-cyan-200" />
                </div>
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                        {title}
                        {titleEn && <span className="text-slate-400 font-medium ml-2">({titleEn})</span>}
                    </h1>
                    {description && (
                        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

export default PageHeader;
