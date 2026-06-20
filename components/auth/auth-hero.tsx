/**
 * Auth hero — left branding panel for login / signup.
 * Gradient orb (CSS-only) floating over the vibrant mesh background.
 * Minimal text: wordmark + "Clinic Management".
 */
export default function AuthHero() {
    return (
        <div className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-between p-12 overflow-hidden">
            {/* Wordmark */}
            <div className="relative z-10">
                <div className="text-white font-black text-3xl tracking-tight">
                    Gonix<span style={{ color: "#15FF83" }}>.</span>
                </div>
                <div className="text-white/55 text-sm tracking-[0.25em] uppercase mt-1">
                    Clinic Management
                </div>
            </div>

            {/* ── Gradient Orb (centered hero) ── */}
            <div className="relative flex-1 flex items-center justify-center">
                <div className="relative animate-orb-float">
                    {/* Glow halo behind */}
                    <div
                        className="absolute inset-0 rounded-full blur-3xl scale-125 opacity-60"
                        style={{ background: "radial-gradient(circle at 50% 50%, #00FFCC 0%, #2B54F0 45%, transparent 70%)" }}
                    />

                    {/* Main sphere */}
                    <div
                        className="relative h-72 w-72 xl:h-80 xl:w-80 rounded-full overflow-hidden"
                        style={{
                            background: [
                                "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.55) 0px, transparent 30%)",
                                "radial-gradient(circle at 70% 80%, #15FF83 0px, transparent 45%)",
                                "radial-gradient(circle at 25% 75%, #00FFCC 0px, transparent 50%)",
                                "radial-gradient(circle at 75% 25%, #5F85FF 0px, transparent 55%)",
                                "linear-gradient(135deg, #2B54F0 0%, #0026A1 100%)",
                            ].join(", "),
                            boxShadow: "0 30px 80px -20px rgba(0,38,161,0.6), inset 0 -20px 60px rgba(0,38,161,0.4)",
                        }}
                    >
                        {/* Grain inside the sphere */}
                        <div
                            className="absolute inset-0 opacity-25 mix-blend-overlay"
                            style={{
                                backgroundImage:
                                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                            }}
                        />

                        {/* Clinic logo — white, centered in the orb */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/clinic-logo.png"
                                alt="Clinic"
                                className="w-[58%] max-w-[200px] object-contain"
                                style={{ filter: "brightness(0) invert(1) drop-shadow(0 4px 12px rgba(0,0,0,0.25))" }}
                            />
                        </div>
                    </div>

                    {/* Accent dots orbiting the sphere */}
                    <span className="absolute -top-2 left-12 h-5 w-5 rounded-full animate-orb-pulse"
                        style={{ background: "#00FFCC", boxShadow: "0 0 16px #00FFCC", border: "2px solid rgba(255,255,255,0.6)" }} />
                    <span className="absolute top-1/3 -right-3 h-4 w-4 rounded-full animate-orb-pulse"
                        style={{ background: "#15FF83", boxShadow: "0 0 14px #15FF83", border: "2px solid rgba(255,255,255,0.6)", animationDelay: "1s" }} />
                    <span className="absolute -bottom-1 left-1/3 h-6 w-6 rounded-full animate-orb-pulse"
                        style={{ background: "#5F85FF", boxShadow: "0 0 18px #5F85FF", border: "2px solid rgba(255,255,255,0.6)", animationDelay: "2s" }} />
                </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 flex items-center justify-between">
                <p className="text-white/40 text-xs">© 2025 Gonix Clinic Management</p>
                <div className="flex items-center gap-2 text-white/50 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#15FF83" }} />
                    All systems operational
                </div>
            </div>
        </div>
    );
}
