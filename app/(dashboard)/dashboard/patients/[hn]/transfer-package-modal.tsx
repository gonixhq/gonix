"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Search, Send } from "lucide-react";
import { transferPackageSessions } from "@/lib/actions/packages";
import { getPatients } from "@/lib/actions/patients";
import type { PatientPackageActive } from "@/lib/package-types";
import { toast } from "@/lib/toast";

type Pt = { hn: string; first_name: string; last_name: string; phone: string | null };

// โอนคอร์สให้คนอื่น (เพื่อน / คู่สมรส) — บางครั้งหรือทั้งหมด
export default function TransferPackageModal({ pp, onClose, onSuccess }: { pp: PatientPackageActive; onClose: () => void; onSuccess: () => void }) {
    const router = useRouter();
    const [q, setQ] = useState("");
    const [results, setResults] = useState<Pt[]>([]);
    const [to, setTo] = useState<Pt | null>(null);
    const [n, setN] = useState("1");
    const [note, setNote] = useState("");
    const [pending, start] = useTransition();
    const remaining = pp.remaining_sessions;

    async function search() {
        if (!q.trim()) return;
        const r = await getPatients(q.trim());
        setResults(((r || []) as Pt[]).filter(p => p.hn !== pp.hn).slice(0, 8));
    }
    function save() {
        if (!to) return;
        start(async () => {
            const res = await transferPackageSessions({ patient_package_id: pp.id, to_hn: to.hn, sessions: Number(n), note });
            if (!res.success) { toast.error(res.error || "โอนไม่สำเร็จ"); return; }
            toast.success(`โอน ${n} ครั้งให้ ${to.first_name} แล้ว`);
            onClose(); onSuccess(); router.refresh();
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
                <div className="flex items-center">
                    <h2 className="font-bold text-lg text-slate-800 flex-1">โอนคอสให้คนอื่น</h2>
                    <button onClick={onClose} aria-label="ปิด"><X className="h-4 w-4 text-slate-400" /></button>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-slate-800">{pp.package_name}</div>
                    <div className="text-xs text-slate-500">เหลือ {remaining} ครั้ง · หมดอายุ {new Date(pp.expires_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</div>
                </div>

                <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">ผู้รับ (ต้องมีประวัติในคลินิก)</span>
                    {to ? (
                        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                            <span className="font-semibold text-emerald-800">{to.hn} · {to.first_name} {to.last_name}</span>
                            <button onClick={() => setTo(null)} className="text-slate-400"><X className="h-4 w-4" /></button>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="ค้นชื่อ / ชื่อเล่น / เบอร์ / HN" className="flex-1 h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                                <button onClick={search} className="h-9 w-9 rounded-lg border border-slate-300 flex items-center justify-center"><Search className="h-4 w-4" /></button>
                            </div>
                            {results.length > 0 && (
                                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                                    {results.map(p => (
                                        <button key={p.hn} type="button" onClick={() => { setTo(p); setResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                                            <span className="font-mono text-blue-700">{p.hn}</span> · {p.first_name} {p.last_name}{p.phone ? ` · ${p.phone}` : ""}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <span className="text-[11px] text-slate-400">ผู้รับยังไม่มีประวัติ? ลงทะเบียนก่อน (เมนูทะเบียนผู้ป่วย) แล้วค่อยโอน</span>
                        </>
                    )}
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">โอนกี่ครั้ง</span>
                        <input type="number" min={1} max={remaining} value={n} onChange={e => setN(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">หมายเหตุ</span>
                        <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น แบ่งให้สามี" className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                    </label>
                </div>
                <p className="text-[11px] text-slate-500">มูลค่าต่อครั้งและวันหมดอายุเท่าเดิม · ผู้รับตัดคอสได้ที่ห้องยาหรือหน้า visit ของตัวเอง · บันทึกประวัติการโอนไว้ทั้งสองฝั่ง</p>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm text-slate-600">ยกเลิก</button>
                    <button onClick={save} disabled={pending || !to || !(Number(n) >= 1) || Number(n) > remaining}
                        className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} โอน {n} ครั้ง
                    </button>
                </div>
            </div>
        </div>
    );
}
