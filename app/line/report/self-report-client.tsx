"use client";

import { useState } from "react";
import Script from "next/script";
import { Loader2, CheckCircle2, AlertTriangle, HeartPulse } from "lucide-react";
import { submitSelfReport } from "@/lib/actions/follow-up";
import type { Severity } from "@/lib/actions/follow-up";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { liff: any } }

const OPTIONS: { key: Severity; label: string; desc: string; cls: string }[] = [
    { key: "green", label: "ปกติดี 🟢", desc: "ไม่มีอาการผิดปกติ", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
    { key: "yellow", label: "มีอาการเล็กน้อย 🟡", desc: "บวม แดง ปวดพอทน", cls: "border-amber-300 bg-amber-50 text-amber-700" },
    { key: "red", label: "อาการรุนแรง 🔴", desc: "ปวดมาก บวมมาก แพ้ยา", cls: "border-rose-300 bg-rose-50 text-rose-700" },
];

export default function SelfReportClient({ liffId }: { liffId: string }) {
    const [ready, setReady] = useState(false);
    const [lineUid, setLineUid] = useState("");
    const [sev, setSev] = useState<Severity | null>(null);
    const [note, setNote] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    async function initLiff() {
        try {
            if (!liffId) { setErr("ยังไม่ได้ตั้งค่า LIFF ID"); return; }
            await window.liff.init({ liffId });
            if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
            const p = await window.liff.getProfile();
            setLineUid(p.userId); setReady(true);
        } catch { setErr("เริ่มต้น LINE ไม่สำเร็จ — กรุณาเปิดผ่านแอป LINE"); }
    }

    async function submit() {
        if (!sev) { setErr("กรุณาเลือกอาการ"); return; }
        setErr(""); setBusy(true);
        const r = await submitSelfReport(lineUid, sev, note.trim());
        setBusy(false);
        if (r.ok) setDone(true); else setErr(r.error || "ส่งไม่สำเร็จ");
    }

    return (
        <>
            <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" onReady={() => { void initLiff(); }} />
            <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(160deg,#0b1020,#141A33 55%,#1C2244)" }}>
                <div className="w-full max-w-sm">
                    <div className="flex items-center gap-2.5 mb-5 text-white justify-center">
                        <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#06C755,#15FF83)" }}><HeartPulse className="h-5 w-5 text-white" /></div>
                        <div className="font-black text-lg">รายงานอาการ</div>
                    </div>
                    <div className="bg-white rounded-3xl shadow-2xl p-6">
                        {done ? (
                            <div className="text-center space-y-3">
                                <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
                                <h1 className="text-lg font-black text-slate-800">ส่งข้อมูลแล้ว</h1>
                                <p className="text-sm text-slate-500">คลินิกได้รับอาการของคุณแล้ว {sev !== "green" ? "ทีมงานจะติดต่อกลับโดยเร็วค่ะ" : "ขอบคุณค่ะ 🙏"}</p>
                                <button onClick={() => window.liff?.closeWindow?.()} className="w-full h-11 rounded-xl bg-slate-800 text-white font-bold mt-2">ปิดหน้าต่าง</button>
                            </div>
                        ) : !ready ? (
                            <div className="text-center py-8 text-slate-400">
                                {err ? <p className="text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {err}</p>
                                    : <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> กำลังเชื่อม LINE...</span>}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-slate-600">หลังทำหัตถการ คุณรู้สึกอย่างไรบ้างคะ?</p>
                                {OPTIONS.map(o => (
                                    <button key={o.key} onClick={() => setSev(o.key)} className={`w-full text-left rounded-2xl border-2 p-3 transition-all ${o.cls} ${sev === o.key ? "ring-2 ring-offset-1 ring-slate-400" : "opacity-80"}`}>
                                        <div className="font-bold">{o.label}</div>
                                        <div className="text-xs opacity-80">{o.desc}</div>
                                    </button>
                                ))}
                                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="อธิบายอาการเพิ่มเติม (ถ้ามี)"
                                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm focus:border-[#06C755] focus:outline-none" />
                                {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" /> {err}</p>}
                                <button onClick={submit} disabled={busy || !sev} className="w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(90deg,#06C755,#15FF83)" }}>
                                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <HeartPulse className="h-5 w-5" />} ส่งรายงานอาการ
                                </button>
                            </div>
                        )}
                    </div>
                    <p className="text-center text-[11px] text-white/40 mt-4">หากฉุกเฉินโปรดโทรหาคลินิกโดยตรง · Powered by Gonix</p>
                </div>
            </div>
        </>
    );
}
