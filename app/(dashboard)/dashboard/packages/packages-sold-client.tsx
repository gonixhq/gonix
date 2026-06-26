"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Sparkles, Search, FileText, Clock, Wallet, CheckCircle2, AlertTriangle } from "lucide-react";
import { pkgCode, type SoldPackageRow } from "@/lib/package-types";
import { cn } from "@/lib/utils";

const money = (n: number) => `฿${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function dateTh(d: string): string {
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}
function outstanding(r: SoldPackageRow): number {
    return r.total_sessions > 0 ? r.paid_amount * r.remaining_sessions / r.total_sessions : 0;
}

export default function PackagesSoldClient({ rows }: { rows: SoldPackageRow[] }) {
    const [filter, setFilter] = useState<"active" | "expiring" | "done" | "all">("active");
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        let list = rows;
        if (filter === "active") list = list.filter(r => r.status === "active" && !r.is_expired);
        else if (filter === "expiring") list = list.filter(r => r.status === "active" && !r.is_expired && r.days_remaining <= 30);
        else if (filter === "done") list = list.filter(r => r.status !== "active" || r.is_expired);
        const q = search.trim().toLowerCase();
        if (q) list = list.filter(r =>
            r.patientName.toLowerCase().includes(q) || r.hn.toLowerCase().includes(q)
            || r.package_name.toLowerCase().includes(q) || pkgCode(r.id).toLowerCase().includes(q));
        return list;
    }, [rows, filter, search]);

    const stats = useMemo(() => {
        const active = rows.filter(r => r.status === "active" && !r.is_expired);
        const totalOutstanding = active.reduce((s, r) => s + outstanding(r), 0);
        const expiringSoon = active.filter(r => r.days_remaining <= 30).length;
        return { activeCount: active.length, totalOutstanding, expiringSoon };
    }, [rows]);

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-10">
            <div className="flex items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                    <Sparkles className="h-4 w-4" /> สรุปคอสบริการ (ที่ขายแล้วทั้งคลินิก)
                </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="gonix-card-premium p-4">
                    <div className="h-9 w-9 rounded-xl bg-blue-100 flex items-center justify-center mb-2"><Sparkles className="h-4 w-4 text-blue-600" /></div>
                    <div className="text-2xl font-black text-slate-800 tabular-nums">{stats.activeCount}</div>
                    <div className="text-xs text-slate-500 font-semibold">คอสที่ใช้งานอยู่</div>
                </div>
                <div className="gonix-card-premium p-4">
                    <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center mb-2"><Wallet className="h-4 w-4 text-violet-600" /></div>
                    <div className="text-2xl font-black text-violet-700 tabular-nums">{money(stats.totalOutstanding)}</div>
                    <div className="text-xs text-slate-500 font-semibold">มูลค่าค้างใช้ (Outstanding)</div>
                </div>
                <div className="gonix-card-premium p-4">
                    <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center mb-2"><Clock className="h-4 w-4 text-amber-600" /></div>
                    <div className="text-2xl font-black text-amber-700 tabular-nums">{stats.expiringSoon}</div>
                    <div className="text-xs text-slate-500 font-semibold">ใกล้หมดอายุ (≤30 วัน)</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                    {([["active", "ใช้งานอยู่"], ["expiring", "ใกล้หมด"], ["done", "จบ/หมดอายุ"], ["all", "ทั้งหมด"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setFilter(k)}
                            className={cn("px-3 h-8 rounded-lg text-xs font-bold transition-all", filter === k ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700")}>{l}</button>
                    ))}
                </div>
                <div className="relative ml-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา ชื่อ / HN / รหัสคอส / ชื่อคอส"
                        className="h-8 w-56 rounded-lg border border-slate-300 pl-8 pr-2 text-xs focus:outline-none focus:border-blue-400" />
                </div>
            </div>

            {/* Table */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 text-sm font-bold text-slate-800">
                    รายการคอส <span className="text-xs text-slate-400 font-normal">({filtered.length})</span>
                </div>
                {filtered.length === 0 ? (
                    <div className="py-14 text-center text-sm text-slate-400">ไม่มีคอสในเงื่อนไขนี้</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2">รหัสคอส</th>
                                    <th className="text-left px-4 py-2">ผู้ป่วย</th>
                                    <th className="text-left px-4 py-2">คอส</th>
                                    <th className="text-center px-4 py-2">คงเหลือ</th>
                                    <th className="text-right px-4 py-2 hidden sm:table-cell">มูลค่าค้าง</th>
                                    <th className="text-left px-4 py-2 hidden md:table-cell">หมดอายุ</th>
                                    <th className="text-center px-4 py-2">ใบเสร็จ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r) => {
                                    const expSoon = r.status === "active" && !r.is_expired && r.days_remaining <= 30;
                                    const inactive = r.status !== "active" || r.is_expired;
                                    return (
                                        <tr key={r.id} className={cn("border-t border-slate-100 hover:bg-blue-50/40 transition-colors", inactive && "opacity-60")}>
                                            <td className="px-4 py-2.5"><span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{pkgCode(r.id)}</span></td>
                                            <td className="px-4 py-2.5">
                                                <Link href={`/dashboard/patients/${r.hn}`} className="font-bold text-slate-800 hover:text-blue-700 truncate">{r.patientName}</Link>
                                                <div className="text-[11px] font-mono text-slate-400">{r.hn}</div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="text-slate-700 truncate">{r.package_name}</div>
                                                {r.category && <div className="text-[11px] text-slate-400">{r.category}</div>}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={cn("font-black tabular-nums", r.remaining_sessions > 0 ? "text-slate-800" : "text-slate-400")}>{r.remaining_sessions}</span>
                                                <span className="text-slate-400 text-xs">/{r.total_sessions}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right hidden sm:table-cell font-bold tabular-nums text-violet-700">{money(outstanding(r))}</td>
                                            <td className="px-4 py-2.5 hidden md:table-cell">
                                                <span className="inline-flex items-center gap-1.5 text-xs">
                                                    <span className="tabular-nums text-slate-600">{dateTh(r.expires_at)}</span>
                                                    {r.is_expired ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">หมดอายุ</span>
                                                        : expSoon ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"><AlertTriangle className="h-2.5 w-2.5 inline" /> {r.days_remaining}ว</span>
                                                            : r.status === "completed" ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5 inline" /> ใช้ครบ</span> : null}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                {r.invoice_id ? (
                                                    <Link href={`/dashboard/finance/${r.invoice_id}`} title="ดูใบเสร็จ" className="inline-flex text-cyan-600 hover:text-cyan-700"><FileText className="h-4 w-4" /></Link>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
