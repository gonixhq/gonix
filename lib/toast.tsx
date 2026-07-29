"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** ระบบแจ้งเตือนแบบ popup (toast) กลางทั้งแอป — zero dependency
 *  เรียกจากที่ไหนก็ได้:  import { toast } from "@/lib/toast";  toast.error("...")
 *  วาง <Toaster /> ครั้งเดียวใน layout */

export type ToastKind = "success" | "error" | "info" | "warning";
export interface ToastItem { id: number; kind: ToastKind; message: string; duration: number }

type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();
let counter = 0;

function emit(kind: ToastKind, message: string, duration?: number) {
    const msg = (message || "").toString().trim();
    if (!msg) return;
    const item: ToastItem = { id: ++counter, kind, message: msg, duration: duration ?? (kind === "error" ? 6000 : 3500) };
    listeners.forEach(l => l(item));
}

export const toast = {
    success: (m: string, d?: number) => emit("success", m, d),
    error: (m: string, d?: number) => emit("error", m, d),
    info: (m: string, d?: number) => emit("info", m, d),
    warning: (m: string, d?: number) => emit("warning", m, d),
};

const STYLE: Record<ToastKind, { bg: string; icon: typeof AlertCircle }> = {
    success: { bg: "bg-emerald-600", icon: CheckCircle2 },
    error: { bg: "bg-rose-600", icon: AlertCircle },
    warning: { bg: "bg-amber-500", icon: AlertTriangle },
    info: { bg: "bg-slate-800", icon: Info },
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
    const [show, setShow] = useState(false);
    useEffect(() => { const t = setTimeout(() => setShow(true), 10); return () => clearTimeout(t); }, []);
    const { bg, icon: Icon } = STYLE[item.kind];
    return (
        <div
            role="alert"
            className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-white shadow-2xl ring-1 ring-black/10",
                "transition-all duration-300 ease-out",
                bg,
                show ? "translate-y-0 opacity-100 scale-100" : "-translate-y-3 opacity-0 scale-95",
            )}
        >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" strokeWidth={2.5} />
            <p className="flex-1 text-sm font-semibold leading-snug">{item.message}</p>
            <button onClick={onClose} className="shrink-0 -mr-1 rounded-lg p-0.5 text-white/70 hover:text-white hover:bg-white/15 transition-colors">
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

export function Toaster() {
    const [items, setItems] = useState<ToastItem[]>([]);
    useEffect(() => {
        const l: Listener = (t) => {
            setItems(prev => [...prev, t]);
            setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), t.duration);
        };
        listeners.add(l);
        return () => { listeners.delete(l); };
    }, []);
    const dismiss = (id: number) => setItems(prev => prev.filter(x => x.id !== id));
    if (items.length === 0) return null;
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[min(92vw,460px)] pointer-events-none">
            {items.map(t => <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />)}
        </div>
    );
}
