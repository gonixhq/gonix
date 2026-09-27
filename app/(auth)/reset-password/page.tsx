"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import AuthShell, { authInputCls, authInputStyle, authButtonCls, authButtonStyle } from "@/components/auth/auth-shell";

// ลิงก์จากอีเมล → สร้าง session ชั่วคราว (recovery) → ตั้งรหัสผ่านใหม่
export default function ResetPasswordPage() {
    const router = useRouter();
    const [supabase] = useState(() => createClient());
    const [phase, setPhase] = useState<"checking" | "ready" | "invalid" | "done">("checking");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [show, setShow] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");
            const errDesc = url.searchParams.get("error_description") || new URLSearchParams(url.hash.slice(1)).get("error_description");
            if (errDesc) { if (!cancelled) { setError(errDesc); setPhase("invalid"); } return; }
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                // client อาจแลก code ให้เองไปแล้ว (detectSessionInUrl) → ถ้ามี session อยู่แล้วถือว่าใช้ได้
                const { data: already } = error ? await supabase.auth.getSession() : { data: { session: null } };
                if (error && !already.session && !cancelled) {
                    setError(/verifier/i.test(error.message)
                        ? "ต้องเปิดลิงก์ในเครื่องและเบราว์เซอร์เดียวกับที่กดขอรีเซ็ต — ขอลิงก์ใหม่จากเครื่องนี้ได้เลย"
                        : "ลิงก์หมดอายุหรือถูกใช้ไปแล้ว — ขอลิงก์ใหม่");
                    setPhase("invalid"); return;
                }
                window.history.replaceState(null, "", "/reset-password");
            }
            const { data } = await supabase.auth.getSession();
            if (!cancelled) setPhase(data.session ? "ready" : "invalid");
        })();
        const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setPhase("ready"); });
        return () => { cancelled = true; sub.subscription.unsubscribe(); };
    }, [supabase]);

    async function save(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (pw.length < 8) { setError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"); return; }
        if (pw !== pw2) { setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
        setSaving(true);
        const { error } = await supabase.auth.updateUser({ password: pw });
        setSaving(false);
        if (error) { setError(/same|different/i.test(error.message) ? "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม" : error.message); return; }
        setPhase("done");
        setTimeout(() => { router.push("/dashboard/overview"); router.refresh(); }, 1500);
    }

    return (
        <AuthShell title="ตั้งรหัสผ่านใหม่" subtitle={phase === "ready" ? "ตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร" : undefined}>
            {phase === "checking" && <div className="flex items-center justify-center gap-2 py-6 text-white/80"><Loader2 className="h-5 w-5 animate-spin" /> กำลังตรวจสอบลิงก์...</div>}

            {phase === "invalid" && (
                <div className="space-y-4">
                    <div className="rounded-xl px-4 py-3 text-sm text-white leading-relaxed" style={{ background: "rgba(255,80,80,0.18)", border: "1px solid rgba(255,120,120,0.4)" }}>
                        {error || "ลิงก์ไม่ถูกต้องหรือหมดอายุ"}
                    </div>
                    <Link href="/forgot-password" className={authButtonCls} style={authButtonStyle}>ขอลิงก์ใหม่</Link>
                </div>
            )}

            {phase === "done" && (
                <div className="rounded-2xl px-4 py-4 text-sm text-white flex items-center gap-3" style={{ background: "rgba(21,255,131,0.15)", border: "1px solid rgba(21,255,131,0.4)" }}>
                    <CheckCircle2 className="h-5 w-5 text-[#15FF83]" /> ตั้งรหัสผ่านใหม่แล้ว — กำลังพาเข้าสู่ระบบ...
                </div>
            )}

            {phase === "ready" && (
                <form onSubmit={save} className="space-y-5">
                    {error && <div className="rounded-xl px-4 py-3 text-sm text-white" style={{ background: "rgba(255,80,80,0.18)", border: "1px solid rgba(255,120,120,0.4)" }}>{error}</div>}
                    {[["pw", "รหัสผ่านใหม่", pw, setPw], ["pw2", "ยืนยันรหัสผ่านใหม่", pw2, setPw2]].map(([id, label, value, set]) => (
                        <div key={id as string} className="space-y-1.5">
                            <label htmlFor={id as string} className="text-sm font-semibold text-white/90">{label as string}</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                                <input id={id as string} type={show ? "text" : "password"} required minLength={8} autoComplete="new-password"
                                    value={value as string} onChange={e => (set as (v: string) => void)(e.target.value)}
                                    placeholder="••••••••" className={`${authInputCls} pr-12`} style={authInputStyle} />
                                {id === "pw" && (
                                    <button type="button" tabIndex={-1} onClick={() => setShow(v => !v)} aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/60">
                                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    <button type="submit" disabled={saving} className={authButtonCls} style={authButtonStyle}>
                        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...</> : "บันทึกรหัสผ่านใหม่"}
                    </button>
                </form>
            )}

            <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-medium" style={{ color: "#00FFCC" }}>
                <ArrowLeft className="h-4 w-4" /> กลับไปหน้าเข้าสู่ระบบ
            </Link>
        </AuthShell>
    );
}
