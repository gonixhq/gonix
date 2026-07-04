"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert, AlertTriangle, Check, X, Loader2, Receipt } from "lucide-react";
import { approvePriceApproval, rejectPriceApproval, type PriceApproval } from "@/lib/actions/price-approvals";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function PriceApprovalsClient({ pending }: { pending: PriceApproval[] }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    function act(id: string, kind: "approve" | "reject") {
        setErr(null);
        setBusyId(id);
        start(async () => {
            const r = kind === "approve" ? await approvePriceApproval(id) : await rejectPriceApproval(id);
            setBusyId(null);
            if (!r.success) { setErr(r.error || "ทำรายการไม่สำเร็จ"); return; }
            router.refresh();
        });
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-4xl mx-auto pb-10">
            <div>
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-[#2B54F0]" /> อนุมัติส่วนลด / ราคาพิเศษ</h1>
                <p className="text-xs text-slate-500 mt-1">ตรวจสอบบิลที่มีส่วนลด · ผู้อนุมัติต้องคนละคนกับผู้เปิดบิล · เคส self-transaction เฉพาะ owner</p>
            </div>

            {err && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{err}</div>}

            {pending.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <Check className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                    <div className="font-bold text-slate-700">ไม่มีรายการรออนุมัติ</div>
                    <div className="text-xs text-slate-400 mt-1">บิลที่มีส่วนลดจะมาแสดงที่นี่ให้ตรวจสอบ</div>
                </div>
            ) : (
                <div className="space-y-3">
                    {pending.map(a => (
                        <div key={a.id} className={`gonix-card-premium p-4 ${a.is_self_transaction ? "ring-2 ring-rose-300" : a.over_discount_limit ? "ring-2 ring-amber-300" : ""}`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {a.inv_id && <Link href={`/dashboard/finance/${a.inv_id}`} className="font-mono text-xs text-cyan-600 hover:underline inline-flex items-center gap-1"><Receipt className="h-3 w-3" />{a.inv_id}</Link>}
                                        {a.is_self_transaction && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> SELF-TRANSACTION</span>
                                        )}
                                        {a.over_discount_limit && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> เกินเพดานคอส</span>
                                        )}
                                    </div>
                                    <div className="text-sm font-bold text-slate-800 mt-1">{a.patient_name || a.hn}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        เปิดบิลโดย <b>{a.requester_name || "—"}</b> · {new Date(a.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] uppercase font-bold text-slate-400">ส่วนลด</div>
                                    <div className="text-xl font-black text-rose-600">−{baht(a.discount_amount)}</div>
                                    <div className="text-[11px] text-slate-400">ยอดก่อนลด {baht(a.subtotal)} → จ่ายจริง {baht(a.total)}</div>
                                    {a.over_discount_limit && a.discount_ceiling != null && (
                                        <div className="text-[11px] text-amber-600 font-semibold mt-0.5">เพดานลดได้ {baht(a.discount_ceiling)} · เกิน {baht(a.discount_amount - a.discount_ceiling)}</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                                <button onClick={() => act(a.id, "approve")} disabled={busyId === a.id}
                                    className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                                    {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} อนุมัติ
                                </button>
                                <button onClick={() => act(a.id, "reject")} disabled={busyId === a.id}
                                    className="h-9 px-4 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                                    <X className="h-4 w-4" /> ปฏิเสธ
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
