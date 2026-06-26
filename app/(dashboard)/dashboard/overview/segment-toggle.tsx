"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Layers, Stethoscope, Sparkles } from "lucide-react";

export type Seg = "all" | "medical" | "aesthetic";

const OPTS: { key: Seg; label: string; Icon: typeof Layers }[] = [
    { key: "all", label: "ทั้งหมด", Icon: Layers },
    { key: "medical", label: "เวชกรรม", Icon: Stethoscope },
    { key: "aesthetic", label: "ความงาม", Icon: Sparkles },
];

/** Global filter — สลับมุมมองคิว/ห้องตามแผนก (เก็บใน ?seg=) */
export function SegmentToggle({ current }: { current: Seg }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();

    function pick(seg: Seg) {
        const next = new URLSearchParams(params.toString());
        if (seg === "all") next.delete("seg");
        else next.set("seg", seg);
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }

    return (
        <div className="inline-flex items-center gap-1 rounded-2xl bg-white/70 border border-slate-200/70 p-1 backdrop-blur">
            {OPTS.map(({ key, label, Icon }) => (
                <button
                    key={key}
                    onClick={() => pick(key)}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold transition-all ${
                        current === key ? "bg-[#2B54F0] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
                    }`}
                >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                </button>
            ))}
        </div>
    );
}
