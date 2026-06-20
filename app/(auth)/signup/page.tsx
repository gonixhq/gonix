"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Mail, Lock, Eye, EyeOff, ArrowRight, Loader2,
    Building2, ShieldCheck, User, Phone, CheckCircle2,
} from "lucide-react";
import AuthHero from "@/components/auth/auth-hero";

/* Roles ที่อนุญาตให้ "ขอ" ตอน signup
   (ไม่รวม owner/admin — ต้องให้คนใน ระบบเลื่อนระดับให้) */
const REQUESTABLE_ROLES: { value: string; label: string }[] = [
    { value: "doctor", label: "แพทย์ (Doctor)" },
    { value: "dentist", label: "ทันตแพทย์ (Dentist)" },
    { value: "nurse", label: "พยาบาล (Nurse)" },
    { value: "pharmacist", label: "เภสัชกร (Pharmacist)" },
    { value: "physio", label: "นักกายภาพบำบัด (Physio)" },
    { value: "receptionist", label: "เจ้าหน้าที่ต้อนรับ (Receptionist)" },
    { value: "accountant", label: "เจ้าหน้าที่บัญชี (Accountant)" },
];

export default function SignupPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");

        const form = new FormData(e.currentTarget);
        const clinicCode = ((form.get("clinic_code") as string) || "").trim();
        const fullName = ((form.get("full_name") as string) || "").trim();
        const phone = ((form.get("phone") as string) || "").trim();
        const requestedRole = (form.get("requested_role") as string) || "nurse";
        const email = ((form.get("email") as string) || "").trim();
        const password = (form.get("password") as string) || "";

        if (!clinicCode) {
            setError("กรุณากรอกรหัสคลินิก");
            setLoading(false);
            return;
        }
        if (password.length < 6) {
            setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
            setLoading(false);
            return;
        }

        try {
            // ── ตรวจรหัสคลินิกก่อน (UX: เจอ error ทันที ไม่ต้องสร้าง user เก้อ) ──
            const { data: tenant, error: tenantError } = await supabase
                .from("tenants")
                .select("id, clinic_name")
                .ilike("clinic_code", clinicCode)
                .maybeSingle();

            if (tenantError) throw new Error(tenantError.message);
            if (!tenant) {
                setError(`ไม่พบคลินิกที่มีรหัส "${clinicCode}" — กรุณาตรวจสอบกับแอดมินคลินิก`);
                setLoading(false);
                return;
            }

            // ── สร้าง auth user + ส่ง metadata ให้ trigger handle_new_user ──
            const { error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        clinic_code: clinicCode.toUpperCase(),
                        full_name: fullName,
                        phone: phone || null,
                        requested_role: requestedRole,
                    },
                },
            });

            if (authError) throw new Error(authError.message);

            setSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    }

    const glassInput = "pl-11 rounded-xl py-3 text-sm text-white placeholder:text-white/40 focus:outline-none transition-all duration-200";
    const glassInputStyle = { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)" } as React.CSSProperties;

    return (
        <div className="min-h-screen flex relative overflow-hidden">
            {/* ════════════ Vibrant Mesh Background ════════════ */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundColor: "#151931",
                    backgroundImage: [
                        "radial-gradient(at 12% 18%, rgba(10,218,255,0.55) 0px, transparent 45%)",
                        "radial-gradient(at 85% 10%, rgba(0,255,204,0.45) 0px, transparent 48%)",
                        "radial-gradient(at 78% 88%, rgba(43,84,240,0.6) 0px, transparent 52%)",
                        "radial-gradient(at 18% 82%, rgba(21,255,131,0.4) 0px, transparent 45%)",
                        "radial-gradient(at 50% 50%, rgba(95,133,255,0.35) 0px, transparent 55%)",
                    ].join(", "),
                }}
            />
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.18] mix-blend-overlay"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
            />

            {/* ════════════ LEFT — Branding (gradient orb hero) ════════════ */}
            <AuthHero />

            {/* ════════════ RIGHT — Signup / Success ════════════ */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative z-10">
                <div className="w-full max-w-md">
                    {/* Mobile wordmark */}
                    <div className="lg:hidden mb-8 text-center">
                        <div className="font-black text-3xl tracking-tight text-white">
                            Gonix<span style={{ color: "#15FF83" }}>.</span>
                        </div>
                    </div>

                    {success ? (
                        /* ══ Success Screen ══ */
                        <div
                            className="rounded-3xl p-8 sm:p-10 space-y-6 text-center animate-fade-in"
                            style={{
                                background: "rgba(255,255,255,0.15)",
                                backdropFilter: "blur(18px) saturate(150%)",
                                WebkitBackdropFilter: "blur(18px) saturate(150%)",
                                border: "1px solid rgba(255,255,255,0.35)",
                                boxShadow: "0 8px 32px 0 rgba(21,25,49,0.25)",
                            }}
                        >
                            <div
                                className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto"
                                style={{ background: "linear-gradient(135deg, #00FFCC, #15FF83)", boxShadow: "0 8px 24px rgba(0,255,204,0.35)" }}
                            >
                                <CheckCircle2 className="h-8 w-8 text-[#0A1020]" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-white">ส่งคำขอเรียบร้อย!</h2>
                                <p className="text-white/70 text-sm leading-relaxed">
                                    บัญชีของคุณถูกสร้างแล้ว และอยู่ระหว่างรอ <strong className="text-white">แอดมินคลินิกอนุมัติ</strong>
                                    <br />
                                    คุณจะเข้าใช้งานระบบได้หลังจากแอดมินตรวจสอบและกำหนดสิทธิ์ให้
                                </p>
                            </div>
                            <div className="rounded-xl p-4 text-left" style={{ background: "rgba(0,255,204,0.1)", border: "1px solid rgba(0,255,204,0.25)" }}>
                                <p className="text-xs text-white/80 leading-relaxed">
                                    💡 <strong>ขั้นต่อไป:</strong> หากอีเมลของคุณต้องยืนยัน กรุณาเช็คอินบ็อกซ์
                                    และคลิก confirmation link ก่อน เพื่อให้บัญชีพร้อมรับการอนุมัติ
                                </p>
                            </div>
                            <Link
                                href="/login"
                                className="inline-flex items-center justify-center gap-2 w-full rounded-full px-4 py-3 text-sm font-bold tracking-wide text-[#0A1020] active:scale-[0.98] transition-all duration-200"
                                style={{ background: "linear-gradient(90deg, #00FFCC 0%, #15FF83 100%)", boxShadow: "0 8px 24px rgba(0,255,204,0.3)" }}
                            >
                                กลับไปหน้าเข้าสู่ระบบ
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    ) : (
                        /* ══ Signup Form ══ */
                        <div
                            className="rounded-3xl p-8 sm:p-10 space-y-6"
                            style={{
                                background: "rgba(255,255,255,0.15)",
                                backdropFilter: "blur(18px) saturate(150%)",
                                WebkitBackdropFilter: "blur(18px) saturate(150%)",
                                border: "1px solid rgba(255,255,255,0.35)",
                                boxShadow: "0 8px 32px 0 rgba(21,25,49,0.25)",
                            }}
                        >
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold text-white tracking-tight">สร้างบัญชีใหม่</h2>
                                <p className="text-white/70 text-sm">
                                    กรอกข้อมูลด้านล่าง — ต้องรอแอดมินอนุมัติก่อนใช้งาน
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="rounded-xl px-4 py-3 text-sm animate-fade-in flex items-start gap-2"
                                        style={{ background: "rgba(255,80,80,0.18)", border: "1px solid rgba(255,120,120,0.4)", color: "#fff" }}>
                                        <div className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="text-xs font-bold">!</span>
                                        </div>
                                        <span className="leading-relaxed">{error}</span>
                                    </div>
                                )}

                                {/* Clinic Code */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="clinic_code" className="text-sm font-semibold text-white/90">
                                        รหัสคลินิก <span style={{ color: "#15FF83" }}>*</span>
                                    </Label>
                                    <div className="relative">
                                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none z-10" />
                                        <Input
                                            id="clinic_code"
                                            name="clinic_code"
                                            required
                                            placeholder="เช่น TANAVEJ"
                                            className={`${glassInput} font-mono uppercase tracking-wider`}
                                            style={glassInputStyle}
                                            onInput={(e) => {
                                                e.currentTarget.value = e.currentTarget.value.toUpperCase();
                                            }}
                                        />
                                    </div>
                                    <p className="text-xs text-white/50">ขอจากเจ้าของคลินิก/แอดมินที่คุณทำงาน</p>
                                </div>

                                {/* Full name + Phone */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="full_name" className="text-sm font-semibold text-white/90">
                                            ชื่อ-นามสกุล <span style={{ color: "#15FF83" }}>*</span>
                                        </Label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none z-10" />
                                            <Input id="full_name" name="full_name" required placeholder="สมชาย ใจดี"
                                                className={glassInput} style={glassInputStyle} />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="phone" className="text-sm font-semibold text-white/90">เบอร์โทร</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none z-10" />
                                            <Input id="phone" name="phone" type="tel" placeholder="08X-XXX-XXXX"
                                                className={glassInput} style={glassInputStyle} />
                                        </div>
                                    </div>
                                </div>

                                {/* Requested role */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="requested_role" className="text-sm font-semibold text-white/90">
                                        ตำแหน่งที่ขอ <span style={{ color: "#15FF83" }}>*</span>
                                    </Label>
                                    <select
                                        id="requested_role"
                                        name="requested_role"
                                        required
                                        defaultValue="nurse"
                                        className="w-full h-11 rounded-xl px-4 text-sm text-white focus:outline-none transition-all [&>option]:text-slate-800"
                                        style={glassInputStyle}
                                    >
                                        {REQUESTABLE_ROLES.map((r) => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-white/50">แอดมินจะตรวจสอบและอาจเปลี่ยน role ให้ตามจริง</p>
                                </div>

                                {/* Email */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="email" className="text-sm font-semibold text-white/90">
                                        อีเมล <span style={{ color: "#15FF83" }}>*</span>
                                    </Label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none z-10" />
                                        <Input id="email" name="email" type="email" required placeholder="you@clinic.com"
                                            className={glassInput} style={glassInputStyle} />
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-1.5">
                                    <Label htmlFor="password" className="text-sm font-semibold text-white/90">
                                        รหัสผ่าน <span style={{ color: "#15FF83" }}>*</span>
                                    </Label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none z-10" />
                                        <Input
                                            id="password"
                                            name="password"
                                            type={showPassword ? "text" : "password"}
                                            required
                                            placeholder="อย่างน้อย 6 ตัวอักษร"
                                            className={`${glassInput} pr-12`}
                                            style={glassInputStyle}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors z-10"
                                            tabIndex={-1}
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Submit — gradient CTA */}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="group w-full rounded-full py-3.5 text-sm font-bold tracking-wide text-[#0A1020] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 mt-2 flex items-center justify-center"
                                    style={{ background: "linear-gradient(90deg, #00FFCC 0%, #15FF83 100%)", boxShadow: "0 8px 24px rgba(0,255,204,0.3)" }}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            กำลังส่งคำขอ...
                                        </>
                                    ) : (
                                        <>
                                            ส่งคำขอสมัคร
                                            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-white/20" />
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="px-3 text-white/50 font-medium">หรือ</span>
                                </div>
                            </div>

                            <p className="text-center text-sm text-white/70">
                                มีบัญชีอยู่แล้ว?{" "}
                                <Link href="/login" className="font-semibold underline-offset-4 hover:underline transition-colors" style={{ color: "#00FFCC" }}>
                                    เข้าสู่ระบบ
                                </Link>
                            </p>
                        </div>
                    )}

                    <p className="text-center text-[11px] text-white/50 mt-6 flex items-center justify-center gap-1.5">
                        <ShieldCheck className="h-3 w-3" />
                        Protected by Supabase RLS & end-to-end encryption
                    </p>
                </div>
            </div>
        </div>
    );
}
