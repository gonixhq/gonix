"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Check } from "lucide-react";

const STORAGE_KEY = "gonix-overview-hidden";

const WIDGETS: { key: string; label: string }[] = [
    { key: "announce", label: "ประกาศจากผู้จัดการ" },
    { key: "perf", label: "ผลงานวันนี้" },
    { key: "funnel", label: "สถานะคิววันนี้" },
    { key: "rooms", label: "สถานะห้องตรวจ" },
    { key: "forecast", label: "พยากรณ์คิวแน่น" },
    { key: "onduty", label: "หมอเวร + แจ้งเตือน" },
    { key: "queues", label: "คิว + นัดหมาย" },
];

function apply(hidden: Set<string>) {
    document.querySelectorAll<HTMLElement>("[data-widget]").forEach((el) => {
        const k = el.dataset.widget;
        if (k) el.style.display = hidden.has(k) ? "none" : "";
    });
}

/** ปรับแต่งหน้า — เลือกซ่อน/แสดง widget ตามความถนัด (จำไว้ในเครื่อง) */
export function DashboardCustomize() {
    const [open, setOpen] = useState(false);
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const ref = useRef<HTMLDivElement>(null);

    // โหลดค่าที่เคยตั้ง + apply
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const arr: string[] = raw ? JSON.parse(raw) : [];
            const s = new Set(arr);
            setHidden(s);
            apply(s);
        } catch {
            /* ignore */
        }
    }, []);

    // re-apply หลังทุก refresh (server re-render ลบ inline style)
    useEffect(() => {
        apply(hidden);
    });

    // ปิด dropdown เมื่อคลิกนอก
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    function toggle(key: string) {
        setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
            } catch {
                /* ignore */
            }
            apply(next);
            return next;
        });
    }

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/70 border border-slate-200/70 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors backdrop-blur"
            >
                <SlidersHorizontal className="h-3.5 w-3.5" /> ปรับแต่งหน้า
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 z-20 w-56 rounded-2xl border border-slate-200 bg-white shadow-xl p-2">
                    <p className="px-2 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">แสดง/ซ่อน การ์ด</p>
                    {WIDGETS.map((w) => {
                        const visible = !hidden.has(w.key);
                        return (
                            <button
                                key={w.key}
                                onClick={() => toggle(w.key)}
                                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                            >
                                <span className={`h-4 w-4 rounded flex items-center justify-center shrink-0 ${visible ? "bg-[#2B54F0] text-white" : "bg-slate-200"}`}>
                                    {visible && <Check className="h-3 w-3" />}
                                </span>
                                <span className="text-sm text-slate-700">{w.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
