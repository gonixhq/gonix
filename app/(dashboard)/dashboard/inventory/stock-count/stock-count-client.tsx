"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { createStockCount, type StockCountHeader } from "@/lib/actions/consumables";

type Row = StockCountHeader & { lines: number; diff_value: number };
const baht = (n: number) => `฿${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function StockCountClient({ counts }: { counts: Row[] }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function newCount() {
        setBusy(true); setError("");
        const r = await createStockCount();
        setBusy(false);
        if (!r.success || !r.id) { setError(r.error || "เปิดรอบไม่สำเร็จ"); return; }
        router.push(`/dashboard/inventory/stock-count/${r.id}`);
    }

    return (
        <div className="space-y-5 max-w-3xl mx-auto animate-fade-in pb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-amber-100"><ClipboardCheck className="h-5 w-5 text-amber-600" /></div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight">ตรวจนับสต๊อก</h1>
                        <p className="text-xs text-slate-500">นับจริงเทียบระบบ หาส่วนต่าง (Shrinkage) — ทำเดือนละครั้งพอ</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <Link href="/dashboard/inventory" className="inline-flex items-center gap-1 h-9 px-3 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> คลัง</Link>
                    <button onClick={newCount} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} เปิดรอบนับใหม่
                    </button>
                </div>
            </div>

            {error && <div className="rounded-xl px-4 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

            <div className="gonix-card-premium overflow-hidden">
                {counts.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีรอบตรวจนับ — กด “เปิดรอบนับใหม่”</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {counts.map((c) => (
                            <Link key={c.id} href={`/dashboard/inventory/stock-count/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-slate-800">{new Date(c.count_date + "T00:00:00").toLocaleDateString("th-TH", { dateStyle: "medium" })}
                                        <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${c.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{c.status === "done" ? "ปิดรอบแล้ว" : "กำลังนับ"}</span>
                                    </div>
                                    <div className="text-xs text-slate-400">{c.lines} รายการ{c.note ? ` · ${c.note}` : ""}</div>
                                </div>
                                {c.diff_value !== 0 && (
                                    <div className={`text-sm font-bold tabular-nums ${c.diff_value < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                        {c.diff_value < 0 ? "−" : "+"}{baht(c.diff_value)}
                                    </div>
                                )}
                                <ChevronRight className="h-4 w-4 text-slate-300" />
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
