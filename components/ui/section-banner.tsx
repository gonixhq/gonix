import { type LucideIcon } from "lucide-react";

type BannerColor = "slate" | "teal" | "sky" | "amber" | "green" | "rose" | "indigo";

interface SectionBannerProps {
    icon: LucideIcon | React.ElementType;
    title: string;
    description?: string;
    color?: BannerColor;
}

// สี icon tile ต่อ banner (โทนใหม่ — หัวขาว ใช้สีเฉพาะที่ tile)
const COLOR_TILE: Record<BannerColor, string> = {
    slate:  "bg-slate-100 text-slate-600",
    teal:   "bg-[#2B54F0]/10 text-[#2B54F0]",
    sky:    "bg-[#0EA5A0]/10 text-[#0EA5A0]",
    amber:  "bg-amber-100 text-amber-600",
    green:  "bg-emerald-100 text-emerald-600",
    rose:   "bg-rose-100 text-rose-600",
    indigo: "bg-indigo-100 text-indigo-600",
};

/**
 * Section banner — หัวการ์ดขาวเรียบ + icon tile สีอ่อน (โทนใหม่)
 * Use inside Card sections to label form/data groups.
 */
export function SectionBanner({ icon: Icon, title, description, color = "sky" }: SectionBannerProps) {
    const tile = COLOR_TILE[color] || COLOR_TILE.sky;
    return (
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tile}`}>
                <Icon className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
                <div className="font-bold text-base text-slate-800 tracking-tight leading-tight">{title}</div>
                {description && (
                    <div className="text-xs text-slate-400 mt-0.5">{description}</div>
                )}
            </div>
        </div>
    );
}

export default SectionBanner;
