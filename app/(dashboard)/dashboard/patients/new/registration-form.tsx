"use client";

import * as React from "react";
import { FieldRow as SharedFieldRow, Section as SharedSection } from "@/components/ui/horizontal-form";
export { HorizontalForm, SubHeader } from "@/components/ui/horizontal-form";

// รูปแบบเฉพาะหน้าลงทะเบียน ไม่เปลี่ยนฟอร์มที่หน้าอื่นใช้ร่วมกัน
export function Section({ title, icon: Icon, children, description, actions }: React.ComponentProps<typeof SharedSection>) {
    return (
        <section className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5 border-b border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                    {Icon && <span className="h-9 w-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></span>}
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-slate-800 break-words">{title}</h2>
                        {description && <p className="text-sm text-slate-600 mt-1">{description}</p>}
                    </div>
                </div>
                {actions}
            </div>
            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">{children}</div>
        </section>
    );
}

export function FieldRow({ label, required, children, colSpan = 1, hint, hidden }: React.ComponentProps<typeof SharedFieldRow>) {
    const id = React.useId();
    const content = React.Children.map(children, child => {
        if (!React.isValidElement<Record<string, unknown>>(child)) return child;
        // ผูกชื่อกับช่องกรอกโดยตรง ส่วนกลุ่มหลายช่องใช้ชื่อกลุ่ม
        if (typeof child.type !== "string" || ["input", "select", "textarea"].includes(child.type)) {
            return React.cloneElement(child, { "aria-labelledby": id });
        }
        return child;
    });
    return (
        <div role="group" aria-labelledby={id} className={`${hidden ? "hidden" : "flex flex-col"} min-w-0 gap-2 ${colSpan === 2 ? "md:col-span-2" : ""}`}>
            <div id={id} className="text-sm font-medium text-slate-700 leading-relaxed">
                {label}{required && <span className="ml-1 text-red-600">*</span>}
            </div>
            <div className="min-w-0">{content}{hint && <p className="text-xs text-slate-600 mt-1.5">{hint}</p>}</div>
        </div>
    );
}

export const FORM_INPUT_CLS = "h-11 text-sm rounded-xl border-slate-300 bg-white focus-visible:ring-blue-500/20 focus-visible:border-blue-500";
export const FORM_SELECT_CLS = "w-full h-11 px-3 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";
