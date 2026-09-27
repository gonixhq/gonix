"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Mail, ArrowLeft, Loader2, Send, CheckCircle2 } from "lucide-react";
import AuthShell, { authInputCls, authInputStyle, authButtonCls, authButtonStyle } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
    const supabase = createClient();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true); setError(null);
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        setLoading(false);
        // ไม่บอกว่ามีบัญชีนี้หรือไม่ (กันเดาอีเมล) — แจ้งเฉพาะข้อผิดพลาดของระบบ เช่น ส่งถี่เกิน
        if (error && /rate|limit|seconds/i.test(error.message)) { setError("ส่งคำขอถี่เกินไป — รอสักครู่แล้วลองใหม่"); return; }
        if (error && !/not found|user/i.test(error.message)) { setError(error.message); return; }
        setSent(true);
    }

    return (
        <AuthShell title="ลืมรหัสผ่าน" subtitle={sent ? undefined : "กรอกอีเมลที่ใช้เข้าสู่ระบบ ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้"}>
            {sent ? (
                <div className="space-y-5">
                    <div className="rounded-2xl px-4 py-4 text-sm text-white flex gap-3" style={{ background: "rgba(21,255,131,0.15)", border: "1px solid rgba(21,255,131,0.4)" }}>
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-[#15FF83]" />
                        <div className="space-y-1 leading-relaxed">
                            <p className="font-semibold">ถ้ามีบัญชีของ <span className="font-mono">{email}</span> ระบบส่งลิงก์ไปแล้ว</p>
                            <p className="text-white/75">เปิดอีเมล (ดูในกล่องจดหมายขยะด้วย) แล้วกดลิงก์ <b>ในเครื่องและเบราว์เซอร์เดียวกับหน้านี้</b> ลิงก์ใช้ได้ภายใน 1 ชั่วโมง</p>
                        </div>
                    </div>
                    <button type="button" onClick={() => setSent(false)} className="w-full text-sm text-white/70 hover:text-white">ไม่ได้รับอีเมล? ส่งอีกครั้ง</button>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-5">
                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm text-white" style={{ background: "rgba(255,80,80,0.18)", border: "1px solid rgba(255,120,120,0.4)" }}>{error}</div>
                    )}
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="text-sm font-semibold text-white/90">อีเมล</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                            <input id="email" type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="doctor@clinic.com" className={authInputCls} style={authInputStyle} />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className={authButtonCls} style={authButtonStyle}>
                        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังส่ง...</> : <><Send className="h-4 w-4" /> ส่งลิงก์ตั้งรหัสผ่านใหม่</>}
                    </button>
                </form>
            )}
            <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-medium" style={{ color: "#00FFCC" }}>
                <ArrowLeft className="h-4 w-4" /> กลับไปหน้าเข้าสู่ระบบ
            </Link>
        </AuthShell>
    );
}
