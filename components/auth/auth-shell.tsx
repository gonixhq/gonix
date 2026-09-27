import AuthHero from "@/components/auth/auth-hero";

// พื้นหลัง + hero + การ์ดกระจก — ใช้ร่วมหน้า auth (ลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่) ให้หน้าตาเหมือนหน้าเข้าสู่ระบบ
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex relative overflow-hidden">
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
            <AuthHero />
            <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative z-10">
                <div className="w-full max-w-md">
                    <div className="lg:hidden mb-8 text-center">
                        <div className="font-black text-3xl tracking-tight text-white">Gonix<span style={{ color: "#15FF83" }}>.</span></div>
                    </div>
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
                            <h2 className="text-3xl font-bold text-white tracking-tight">{title}</h2>
                            {subtitle && <p className="text-white/70 text-sm leading-relaxed">{subtitle}</p>}
                        </div>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

export const authInputStyle = { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)" } as const;
export const authButtonStyle = { background: "linear-gradient(90deg, #00FFCC 0%, #15FF83 100%)", boxShadow: "0 8px 24px rgba(0,255,204,0.3)" } as const;
export const authInputCls = "w-full rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none transition-all duration-200";
export const authButtonCls = "group w-full rounded-full px-4 py-3.5 text-sm font-bold tracking-wide text-[#0A1020] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2";
