"use client";

import { useState } from "react";
import Script from "next/script";
import { Loader2, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { linkLineAccount } from "@/lib/actions/line-link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { liff: any } }

export default function LineLinkClient({ liffId, clinicId }: { liffId: string; clinicId: string }) {
    const [ready, setReady] = useState(false);
    const [lineUid, setLineUid] = useState("");
    const [display, setDisplay] = useState("");
    const [hn, setHn] = useState("");
    const [phone4, setPhone4] = useState("");
    const [err, setErr] = useState("");
    const [done, setDone] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function initLiff() {
        try {
            if (!liffId) { setErr("ยังไม่ได้ตั้งค่า LIFF ID (NEXT_PUBLIC_LIFF_ID_LINK)"); return; }
            await window.liff.init({ liffId });
            if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
            const p = await window.liff.getProfile();
            setLineUid(p.userId); setDisplay(p.displayName); setReady(true);
        } catch {
            setErr("เริ่มต้น LINE ไม่สำเร็จ — กรุณาเปิดผ่านแอป LINE");
        }
    }

    async function submit() {
        setErr("");
        if (!hn.trim() || phone4.replace(/\D/g, "").length !== 4) { setErr("กรุณากรอก HN และเบอร์ 4 ตัวท้าย"); return; }
        setBusy(true);
        const res = await linkLineAccount(clinicId, lineUid, display, hn, phone4);
        setBusy(false);
        if (res.ok) setDone(res.name || "");
        else setErr(res.error || "");
    }

    return (
        <>
            <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" onReady={() => { void initLiff(); }} />
            <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(160deg,#0b1020,#141A33 55%,#1C2244)" }}>
                <div className="w-full max-w-sm">
                    <div className="flex items-center gap-2.5 mb-5 text-white justify-center">
                        <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#06C755,#15FF83)" }}>
                            <Link2 className="h-5 w-5 text-white" />
                        </div>
                        <div className="font-black text-lg">ผูกบัญชี LINE</div>
                    </div>

                    <div className="bg-white rounded-3xl shadow-2xl p-6">
                        {done !== null ? (
                            <div className="text-center space-y-3">
                                <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
                                <h1 className="text-lg font-black text-slate-800">ผูกบัญชีสำเร็จ</h1>
                                <p className="text-sm text-slate-500">{done ? `สวัสดีคุณ ${done}` : ""} ตั้งแต่นี้จะได้รับแจ้งเตือนนัดหมาย/ผลตรวจผ่าน LINE</p>
                                <button onClick={() => window.liff?.closeWindow?.()} className="w-full h-11 rounded-xl bg-slate-800 text-white font-bold mt-2">ปิดหน้าต่าง</button>
                            </div>
                        ) : !ready ? (
                            <div className="text-center py-8 text-slate-400">
                                {err ? <p className="text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {err}</p>
                                    : <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> กำลังเชื่อม LINE...</span>}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-sm text-slate-600">ยืนยันตัวตนเพื่อผูกบัญชี LINE ({display}) กับข้อมูลผู้ป่วยของคุณ</p>
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1 block">HN (เลขประจำตัวผู้ป่วย)</label>
                                    <input value={hn} onChange={(e) => setHn(e.target.value)} placeholder="เช่น 0001"
                                        className="w-full h-12 rounded-xl border-2 border-slate-200 px-3 text-base font-mono focus:border-[#06C755] focus:outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1 block">เบอร์มือถือ 4 ตัวท้าย</label>
                                    <input value={phone4} onChange={(e) => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                        inputMode="numeric" maxLength={4} placeholder="เช่น 4993"
                                        className="w-full h-12 rounded-xl border-2 border-slate-200 px-3 text-base font-mono tracking-[0.3em] focus:border-[#06C755] focus:outline-none" />
                                </div>
                                {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" /> {err}</p>}
                                <button onClick={submit} disabled={busy}
                                    className="w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                                    style={{ background: "linear-gradient(90deg,#06C755,#15FF83)" }}>
                                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />} ผูกบัญชี
                                </button>
                            </div>
                        )}
                    </div>
                    <p className="text-center text-[11px] text-white/40 mt-4">ข้อมูลของคุณถูกเก็บเป็นความลับ · Powered by Gonix</p>
                </div>
            </div>
        </>
    );
}
