/**
 * Horizontal Form Layout — shared compact form pattern.
 *
 * Usage:
 *   <HorizontalForm>
 *     <Section title="ข้อมูลพื้นฐาน" icon={FileText} color="slate">
 *       <FieldRow label="ชื่อ" required>
 *         <Input ... />
 *       </FieldRow>
 *       <SubHeader>กลุ่มย่อย</SubHeader>
 *       <FieldRow label="HN" colSpan={2}>...</FieldRow>
 *     </Section>
 *   </HorizontalForm>
 */

import * as React from "react";

type SectionColor = "slate" | "amber" | "emerald" | "sky" | "rose" | "teal" | "purple" | "indigo";

// สีของ icon tile ต่อ section (โทนใหม่ — การ์ดขาวเรียบ ใช้สีเฉพาะที่ tile)
const SECTION_TILE: Record<SectionColor, string> = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-600",
    emerald: "bg-emerald-100 text-emerald-600",
    sky: "bg-[#0EA5A0]/10 text-[#0EA5A0]",
    rose: "bg-rose-100 text-rose-600",
    teal: "bg-[#2B54F0]/10 text-[#2B54F0]",
    purple: "bg-purple-100 text-purple-600",
    indigo: "bg-indigo-100 text-indigo-600",
};

/** Container that wraps multiple sections — provides consistent spacing */
export function HorizontalForm({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={`space-y-4 ${className || ""}`}>{children}</div>;
}

/** Section box with colored header + 2-column grid content */
export function Section({
    title,
    icon: Icon,
    color = "slate",
    children,
    description,
    actions,
}: {
    title: string;
    icon?: React.ElementType;
    color?: SectionColor;
    children: React.ReactNode;
    description?: string;
    actions?: React.ReactNode;
}) {
    const tile = SECTION_TILE[color];
    return (
        <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                    {Icon && (
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tile}`}>
                            <Icon className="h-5 w-5" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-800 truncate">{title}</h2>
                        {description && <p className="text-[12px] text-slate-400 truncate">{description}</p>}
                    </div>
                </div>
                {actions && <div className="shrink-0">{actions}</div>}
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                {children}
            </div>
        </div>
    );
}

/** Field row: label LEFT (fixed width), input RIGHT */
export function FieldRow({
    label,
    required,
    children,
    colSpan = 1,
    labelWidth = 150,
    align = "center",
    hint,
    hidden,
}: {
    label: React.ReactNode;
    required?: boolean;
    children: React.ReactNode;
    /** 1 = half (default), 2 = full row */
    colSpan?: 1 | 2;
    /** Label column width in px (default 150) */
    labelWidth?: number;
    /** Vertical alignment of label */
    align?: "center" | "start";
    /** Helper text below input */
    hint?: React.ReactNode;
    /** ซ่อนด้วย CSS (ยังคง mount ไว้ — กัน input เสีย focus) */
    hidden?: boolean;
}) {
    return (
        <div
            className={`grid items-${align} gap-3 ${colSpan === 2 ? "md:col-span-2" : ""} ${hidden ? "hidden" : ""}`}
            style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}
        >
            <label
                className={`text-[16px] font-semibold text-right ${required ? "text-red-600" : "text-slate-700"} truncate ${align === "start" ? "pt-2.5" : ""}`}
            >
                {required && <span className="mr-0.5">*</span>}{label}
            </label>
            <div className="min-w-0">
                {children}
                {hint && <p className="text-[12px] text-slate-500 mt-1">{hint}</p>}
            </div>
        </div>
    );
}

/** Sub-header inside a section (divider with label) */
export function SubHeader({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={`col-span-full text-[13px] font-bold uppercase tracking-wider text-slate-500 pb-2 mb-1 border-b border-slate-200 flex items-center gap-1.5 ${className || ""}`}
        >
            <span className="h-1 w-5 bg-slate-300 rounded-full" />
            {children}
        </div>
    );
}

/** Standardized input/select class strings — use to keep visual consistency */
export const FORM_INPUT_CLS = "h-11 text-[16px] rounded-lg border-slate-300 focus-visible:ring-[#2B54F0]/20 focus-visible:border-[#2B54F0]";
export const FORM_SELECT_CLS = "w-full h-11 px-3 text-[16px] rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20 focus:border-[#2B54F0]";
