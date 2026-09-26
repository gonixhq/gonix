"use client";

// อัตราคอมแนะนำรายเมนู (เฟส 2D) — ว่าง = ใช้ % มาตรฐานของคลินิก (ตั้งที่หน้าอัตราการเงิน)
export type RefCommMode = "" | "pct" | "fixed" | "per_unit" | "none";

const MODES: { v: RefCommMode; label: string; unit?: string }[] = [
    { v: "", label: "มาตรฐาน (% ของคลินิก)" },
    { v: "pct", label: "% ของยอดสุทธิ", unit: "%" },
    { v: "fixed", label: "บาทต่อรายการ", unit: "฿" },
    { v: "per_unit", label: "บาทต่อหน่วย (เช่น ต่อ cc)", unit: "฿/หน่วย" },
    { v: "none", label: "ไม่มีคอมแนะนำ" },
];

export default function RefCommField({ mode, value, onChange, className = "" }: {
    mode: RefCommMode;
    value: string;
    onChange: (mode: RefCommMode, value: string) => void;
    className?: string;
}) {
    const m = MODES.find(x => x.v === mode) || MODES[0];
    return (
        <div className={`flex items-center gap-2 flex-wrap ${className}`}>
            <select value={mode} onChange={e => onChange(e.target.value as RefCommMode, e.target.value === "" || e.target.value === "none" ? "" : value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm">
                {MODES.map(x => <option key={x.v} value={x.v}>{x.label}</option>)}
            </select>
            {m.unit && (
                <label className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <input type="number" min="0" step="0.01" value={value} onChange={e => onChange(mode, e.target.value)}
                        className="h-9 w-28 rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" placeholder="0" />
                    {m.unit}
                </label>
            )}
        </div>
    );
}

/** แปลงค่าจากฟอร์ม → คอลัมน์ DB */
export function refCommPayload(mode: RefCommMode, value: string): { ref_comm_mode: string | null; ref_comm_value: number | null } {
    if (!mode) return { ref_comm_mode: null, ref_comm_value: null };
    if (mode === "none") return { ref_comm_mode: "none", ref_comm_value: null };
    return { ref_comm_mode: mode, ref_comm_value: Number(value) || 0 };
}
