"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Loader2 } from "lucide-react";
import AuthHero from "@/components/auth/auth-hero";

export default function LoginPage() {
    const router = useRouter();
    const supabase = createClient();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        router.push("/dashboard/overview");
        router.refresh();
    };

    return (
        <div className="min-h-screen flex relative overflow-hidden">
            {/* ════════════ Vibrant Mesh Background (full-bleed) ════════════ */}
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
            {/* Grain overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.18] mix-blend-overlay"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
            />

            {/* ════════════ LEFT — Branding (gradient orb hero) ════════════ */}
            <AuthHero />

            {/* ════════════ RIGHT — Glass Login Card ════════════ */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative z-10">
                <div className="w-full max-w-md">
                    {/* Mobile wordmark */}
                    <div className="lg:hidden mb-8 text-center">
                        <div className="font-black text-3xl tracking-tight text-white">
                            Gonix<span style={{ color: "#15FF83" }}>.</span>
                        </div>
                    </div>

                    {/* Glass card */}
                    <div
                        className="rounded-3xl p-8 sm:p-10 space-y-7"
                        style={{
                            background: "rgba(255,255,255,0.15)",
                            backdropFilter: "blur(18px) saturate(150%)",
                            WebkitBackdropFilter: "blur(18px) saturate(150%)",
                            border: "1px solid rgba(255,255,255,0.35)",
                            boxShadow: "0 8px 32px 0 rgba(21,25,49,0.25)",
                        }}
                    >
                        <div className="space-y-2">
                            <h2 className="text-3xl font-bold text-white tracking-tight">เข้าสู่ระบบ</h2>
                            <p className="text-white/70 text-sm">เข้าสู่ระบบเพื่อจัดการคลินิกของคุณ</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5">
                            {error && (
                                <div className="rounded-xl px-4 py-3 text-sm animate-fade-in flex items-start gap-2"
                                    style={{ background: "rgba(255,80,80,0.18)", border: "1px solid rgba(255,120,120,0.4)", color: "#fff" }}>
                                    <div className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-xs font-bold">!</span>
                                    </div>
                                    <span className="leading-relaxed">{error}</span>
                                </div>
                            )}

                            {/* Email */}
                            <div className="space-y-1.5">
                                <label htmlFor="email" className="text-sm font-semibold text-white/90">อีเมล</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="doctor@clinic.com"
                                        required
                                        className="w-full rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none transition-all duration-200"
                                        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)" }}
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="password" className="text-sm font-semibold text-white/90">รหัสผ่าน</label>
                                    <Link href="/forgot-password" className="text-xs font-medium transition-colors" style={{ color: "#00FFCC" }}>
                                        ลืมรหัสผ่าน?
                                    </Link>
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 pointer-events-none" />
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full rounded-xl pl-11 pr-12 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none transition-all duration-200"
                                        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)" }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
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
                                className="group w-full rounded-full px-4 py-3.5 text-sm font-bold tracking-wide text-[#0A1020] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                style={{
                                    background: "linear-gradient(90deg, #00FFCC 0%, #15FF83 100%)",
                                    boxShadow: "0 8px 24px rgba(0,255,204,0.3)",
                                }}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        กำลังเข้าสู่ระบบ...
                                    </>
                                ) : (
                                    <>
                                        เข้าสู่ระบบ
                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
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
                                <span className="px-3 text-white/50 font-medium" style={{ background: "transparent" }}>หรือ</span>
                            </div>
                        </div>

                        {/* Signup link */}
                        <p className="text-center text-sm text-white/70">
                            ยังไม่มีบัญชี?{" "}
                            <Link href="/signup" className="font-semibold underline-offset-4 hover:underline transition-colors" style={{ color: "#00FFCC" }}>
                                สร้างบัญชีใหม่
                            </Link>
                        </p>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-[11px] text-white/50 mt-6 flex items-center justify-center gap-1.5">
                        <ShieldCheck className="h-3 w-3" />
                        Protected by Supabase RLS & end-to-end encryption
                    </p>
                </div>
            </div>
        </div>
    );
}
