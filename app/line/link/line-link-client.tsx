"use client";

import { useState, useEffect } from "react";
import Script from "next/script";
import { Loader2, CheckCircle2, AlertTriangle, Link2, ShieldCheck } from "lucide-react";
import { linkLineAccount, linkStaffLine } from "@/lib/actions/line-link";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { liff: any } }

export default function LineLinkClient({ liffId, clinicId, staffMode = false, staffToken = "" }: { liffId: string; clinicId: string; staffMode?: boolean; staffToken?: string }) {
    const [ready, setReady] = useState(false);
    const [lineUid, setLineUid] = useState("");
    const [display, setDisplay] = useState("");
    const [idToken, setIdToken] = useState("");
    const [hn, setHn] = useState("");
    const [phone4, setPhone4] = useState("");
    const [err, setErr] = useState("");
    const [done, setDone] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [clinicName, setClinicName] = useState("");
    const [clinicLogo, setClinicLogo] = useState("");

    // ดึงชื่อ + โลโก้คลินิก (tenants อ่านแบบ public ได้)
    useEffect(() => {
        if (!clinicId) return;
        (async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.from("tenants").select("clinic_name, logo_url").eq("id", clinicId).maybeSingle();
                if (data) { setClinicName((data.clinic_name as string) || ""); setClinicLogo((data.logo_url as string) || ""); }
            } catch { /* ignore */ }
        })();
    }, [clinicId]);

    async function initLiff() {
        try {
            if (!liffId) { setErr("ยังไม่ได้ตั้งค่า LIFF ID (NEXT_PUBLIC_LIFF_ID_LINK)"); return; }
            await window.liff.init({ liffId });
            if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
            const p = await window.liff.getProfile();
            setLineUid(p.userId); setDisplay(p.displayName);
            try { setIdToken(window.liff.getIDToken() || ""); } catch { /* ignore */ }
            setReady(true);
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

    async function submitStaff() {
        setErr("");
        if (!idToken) { setErr("ยืนยันตัวตนไม่สำเร็จ — เปิดลิงก์ผ่านแอป LINE อีกครั้ง"); return; }
        setBusy(true);
        const res = await linkStaffLine(staffToken, idToken, display);
        setBusy(false);
        if (res.ok) setDone(display || "");
        else setErr(res.error || "");
    }

    const inputCls = "w-full h-12 rounded-xl border-2 border-slate-200 px-3.5 text-base font-mono focus:border-[#0891b2] focus:ring-4 focus:ring-[#0891b2]/10 focus:outline-none transition";
    const btnStyle = { background: "linear-gradient(90deg,#06C755,#0ab45f)", boxShadow: "0 8px 20px -6px rgba(6,199,85,0.5)" } as const;

    return (
        <>
            <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" onReady={() => { void initLiff(); }} />
            <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "radial-gradient(120% 90% at 50% 0%, #0e7490 0%, #0b3d4d 55%, #072b38 100%)" }}>
                <div className="w-full max-w-sm">
                    {/* หัว: โลโก้จริง + ชื่อคลินิก */}
                    <div className="flex flex-col items-center gap-3 mb-6">
                        <div className="h-20 w-20 rounded-3xl bg-white shadow-xl flex items-center justify-center overflow-hidden ring-4 ring-white/15">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={clinicLogo || "/clinic-logo.png"} alt="" className="h-14 w-14 object-contain" />
                        </div>
                        <div className="text-center">
                            <div className="text-white font-black text-lg leading-tight">{clinicName || "คลินิก"}</div>
                            <div className="inline-flex items-center gap-1.5 text-white/70 text-sm mt-0.5">
                                <span className="h-4 w-4 rounded-full flex items-center justify-center" style={{ background: "#06C755" }}><Link2 className="h-2.5 w-2.5 text-white" /></span>
                                {staffMode ? "ผูก LINE พนักงาน" : "เชื่อมบัญชี LINE"}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl shadow-2xl p-6">
                        {done !== null ? (
                            <div className="text-center space-y-3 py-2">
                                <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                                </div>
                                <h1 className="text-lg font-black text-slate-800">เชื่อมบัญชีสำเร็จ</h1>
                                <p className="text-sm text-slate-500 leading-relaxed">
                                    {done ? <>สวัสดีคุณ <b className="text-slate-700">{done}</b><br /></> : ""}
                                    {staffMode ? "ตั้งแต่นี้จะได้รับแจ้งเตือนอาการด่วนของคนไข้ผ่าน LINE" : "ตั้งแต่นี้จะได้รับแจ้งเตือนนัดหมาย / ผลตรวจ ผ่าน LINE"}
                                </p>
                                <button onClick={() => window.liff?.closeWindow?.()} className="w-full h-11 rounded-xl bg-slate-800 text-white font-bold mt-1 active:scale-[0.98] transition">ปิดหน้าต่าง</button>
                            </div>
                        ) : !ready ? (
                            <div className="text-center py-10 text-slate-400">
                                {err ? <p className="text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {err}</p>
                                    : <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> กำลังเชื่อม LINE...</span>}
                            </div>
                        ) : staffMode ? (
                            <div className="space-y-4 text-center">
                                <p className="text-sm text-slate-600">ผูกบัญชี LINE <b className="text-slate-800">{display}</b> เพื่อรับแจ้งเตือนอาการด่วนของคนไข้</p>
                                {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 flex items-center gap-1.5 text-left"><AlertTriangle className="h-4 w-4 shrink-0" /> {err}</p>}
                                <button onClick={submitStaff} disabled={busy}
                                    className="w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition"
                                    style={btnStyle}>
                                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />} ยืนยันผูกบัญชี
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-sm text-slate-600 text-center">ยืนยันตัวตนเพื่อเชื่อม LINE <b className="text-slate-800">{display}</b> กับข้อมูลผู้ป่วยของคุณ</p>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 block">HN (เลขประจำตัวผู้ป่วย)</label>
                                    <input value={hn} onChange={(e) => setHn(e.target.value)} placeholder="เช่น HN690011 หรือ 690011" className={inputCls} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 block">เบอร์มือถือ 4 ตัวท้าย</label>
                                    <input value={phone4} onChange={(e) => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                        inputMode="numeric" maxLength={4} placeholder="เช่น 4993"
                                        className={`${inputCls} tracking-[0.4em] text-center`} />
                                </div>
                                {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" /> {err}</p>}
                                <button onClick={submit} disabled={busy}
                                    className="w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition"
                                    style={btnStyle}>
                                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />} เชื่อมบัญชี
                                </button>
                            </div>
                        )}
                    </div>

                    <p className="text-center text-[11px] text-white/50 mt-5 inline-flex items-center gap-1.5 w-full justify-center">
                        <ShieldCheck className="h-3.5 w-3.5" /> ข้อมูลของคุณถูกเก็บเป็นความลับ · Powered by Gonix
                    </p>
                </div>
            </div>
        </>
    );
}
