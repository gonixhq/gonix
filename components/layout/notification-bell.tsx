"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
    Bell, AlertTriangle, CalendarClock, Wallet, PackageOpen, X, ChevronRight,
} from "lucide-react";
import { getAlerts, type AlertSummary, type AlertItem } from "@/lib/actions/alerts";

const TYPE_META: Record<AlertItem["type"], { icon: React.ElementType; color: string; bg: string }> = {
    low_stock: { icon: PackageOpen, color: "text-red-600", bg: "bg-red-50" },
    expired: { icon: CalendarClock, color: "text-red-600", bg: "bg-red-50" },
    expiry: { icon: CalendarClock, color: "text-orange-600", bg: "bg-orange-50" },
    outstanding: { icon: Wallet, color: "text-amber-600", bg: "bg-amber-50" },
};

/** สีตามระดับความเร่งด่วนของวันหมดอายุ */
function expiryMeta(item: AlertItem): { color: string; bg: string } {
    if (item.type === "expired") return { color: "text-red-600", bg: "bg-red-50" };
    if (item.expiryLevel === "critical") return { color: "text-red-600", bg: "bg-red-50" };
    if (item.expiryLevel === "urgent") return { color: "text-orange-600", bg: "bg-orange-50" };
    return { color: "text-yellow-600", bg: "bg-yellow-50" };
}

export default function NotificationBell() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<AlertSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let mounted = true;
        getAlerts().then(d => { if (mounted) { setData(d); setLoading(false); } });
        // Refresh ทุก 5 นาที
        const interval = setInterval(() => {
            getAlerts().then(d => { if (mounted) setData(d); });
        }, 5 * 60 * 1000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        if (open) document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    const total = data?.total || 0;
    const hasHigh = (data?.lowStock || 0) + (data?.expired || 0) > 0;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="relative h-10 w-10 rounded-xl flex items-center justify-center bg-white/10 border border-white/15 hover:bg-white/20 text-white/60 hover:text-[#00FFCC] transition-all duration-300"
            >
                <Bell className="h-5 w-5" />
                {total > 0 && (
                    <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white ${hasHigh ? "bg-red-500" : "bg-amber-500"}`}>
                        {total > 99 ? "99+" : total}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 w-[380px] max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-fade-in">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Bell className="h-4 w-4 text-slate-600" /> แจ้งเตือน
                            {total > 0 && <span className="text-xs text-slate-500">({total})</span>}
                        </h3>
                        <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-lg hover:bg-slate-200 flex items-center justify-center">
                            <X className="h-4 w-4 text-slate-500" />
                        </button>
                    </div>

                    {/* Summary chips */}
                    {data && total > 0 && (
                        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 flex-wrap">
                            {data.lowStock > 0 && (
                                <Link href="/dashboard/inventory" onClick={() => setOpen(false)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[11px] font-bold hover:bg-red-100">
                                    <AlertTriangle className="h-3 w-3" /> สต๊อกต่ำ {data.lowStock}
                                </Link>
                            )}
                            {data.expired > 0 && (
                                <Link href="/dashboard/inventory" onClick={() => setOpen(false)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[11px] font-bold hover:bg-red-100">
                                    <CalendarClock className="h-3 w-3" /> หมดอายุ {data.expired}
                                </Link>
                            )}
                            {data.expiryCritical > 0 && (
                                <Link href="/dashboard/inventory" onClick={() => setOpen(false)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[11px] font-bold hover:bg-red-100">
                                    <CalendarClock className="h-3 w-3" /> ด่วน ≤7วัน {data.expiryCritical}
                                </Link>
                            )}
                            {data.expiryUrgent > 0 && (
                                <Link href="/dashboard/inventory" onClick={() => setOpen(false)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-700 text-[11px] font-bold hover:bg-orange-100">
                                    <CalendarClock className="h-3 w-3" /> ≤30วัน {data.expiryUrgent}
                                </Link>
                            )}
                            {data.expiryWatch > 0 && (
                                <Link href="/dashboard/inventory" onClick={() => setOpen(false)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 text-[11px] font-bold hover:bg-yellow-100">
                                    <CalendarClock className="h-3 w-3" /> เฝ้าระวัง {data.expiryWatch}
                                </Link>
                            )}
                            {data.outstanding > 0 && (
                                <Link href="/dashboard/reports" onClick={() => setOpen(false)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100">
                                    <Wallet className="h-3 w-3" /> ค้างชำระ {data.outstanding}
                                </Link>
                            )}
                        </div>
                    )}

                    {/* List */}
                    <div className="max-h-[400px] overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด...</div>
                        ) : !data || data.items.length === 0 ? (
                            <div className="p-10 text-center">
                                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                                    <Bell className="h-6 w-6 text-emerald-400" />
                                </div>
                                <p className="text-sm font-medium text-slate-600">ไม่มีแจ้งเตือน</p>
                                <p className="text-xs text-slate-400 mt-0.5">ทุกอย่างเรียบร้อยดี 👍</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {data.items.map(item => {
                                    const baseMeta = TYPE_META[item.type];
                                    const meta = (item.type === "expiry" || item.type === "expired")
                                        ? { ...baseMeta, ...expiryMeta(item) }
                                        : baseMeta;
                                    const Icon = baseMeta.icon;
                                    return (
                                        <Link
                                            key={item.id}
                                            href={item.href}
                                            onClick={() => setOpen(false)}
                                            className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                                        >
                                            <div className={`h-8 w-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                                                <Icon className={`h-4 w-4 ${meta.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-slate-800 text-sm truncate">{item.title}</div>
                                                <div className="text-[12px] text-slate-500 truncate">{item.detail}</div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mt-1" />
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
