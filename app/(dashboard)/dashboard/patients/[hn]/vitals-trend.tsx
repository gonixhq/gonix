import { HeartPulse, Weight, Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface VitalRow {
    recorded_at: string;
    bp_systolic: number | null;
    bp_diastolic: number | null;
    weight_kg: number | null;
    bmi: number | null;
}

const W = 220;
const H = 56;

/** สร้าง path จากชุดค่า (เว้น null) — คืน { d, points } */
function buildLine(values: (number | null)[]): { d: string; pts: { x: number; y: number; v: number }[] } {
    const idx = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null && !isNaN(p.v as number)) as { v: number; i: number }[];
    if (idx.length === 0) return { d: "", pts: [] };
    const vals = idx.map((p) => p.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const n = values.length;
    const pts = idx.map((p) => ({
        x: n === 1 ? W / 2 : (p.i / (n - 1)) * W,
        y: H - 6 - ((p.v - min) / span) * (H - 12),
        v: p.v,
    }));
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return { d, pts };
}

function Trend({ first, last, unit, invert }: { first: number | null; last: number | null; unit?: string; invert?: boolean }) {
    if (first === null || last === null) return null;
    const diff = last - first;
    const up = diff > 0;
    const flat = Math.abs(diff) < 0.05;
    const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
    // invert=true → ขึ้น = ไม่ดี (เช่น น้ำหนัก/ความดัน) แดง, ลง = เขียว
    const good = flat ? "text-slate-400" : (up === !!invert) ? "text-emerald-600" : "text-red-500";
    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good}`}>
            <Icon className="h-3 w-3" />
            {flat ? "คงที่" : `${up ? "+" : ""}${Math.round(diff * 10) / 10}${unit || ""}`}
        </span>
    );
}

function MiniChart({
    icon: Icon, title, latest, unit, lines, first, last, invert,
}: {
    icon: React.ElementType;
    title: string;
    latest: string;
    unit?: string;
    lines: { d: string; pts: { x: number; y: number; v: number }[]; color: string }[];
    first: number | null;
    last: number | null;
    invert?: boolean;
}) {
    const hasData = lines.some((l) => l.pts.length > 0);
    return (
        <div className="rounded-2xl border border-slate-200/70 bg-white/60 p-4">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <Icon className="h-3.5 w-3.5 text-[#2B54F0]" /> {title}
                </div>
                <Trend first={first} last={last} unit={unit} invert={invert} />
            </div>
            <div className="text-xl font-extrabold text-slate-800">{latest}</div>
            {hasData ? (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1.5" preserveAspectRatio="none" style={{ height: 48 }}>
                    {lines.map((l, li) => (
                        <g key={li}>
                            <path d={l.d} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                            {l.pts.length > 0 && <circle cx={l.pts[l.pts.length - 1].x} cy={l.pts[l.pts.length - 1].y} r="2.5" fill={l.color} />}
                        </g>
                    ))}
                </svg>
            ) : (
                <p className="text-xs text-slate-400 mt-2">ยังไม่มีข้อมูล</p>
            )}
        </div>
    );
}

/** Trend chart สัญญาณชีพ — ความดัน / น้ำหนัก / BMI ข้ามเวลา */
export function VitalsTrend({ vitals }: { vitals: VitalRow[] }) {
    if (vitals.length < 2) return null; // ต้องมี ≥2 ครั้งถึงเห็น trend

    const sys = vitals.map((v) => (v.bp_systolic != null ? Number(v.bp_systolic) : null));
    const dia = vitals.map((v) => (v.bp_diastolic != null ? Number(v.bp_diastolic) : null));
    const wt = vitals.map((v) => (v.weight_kg != null ? Number(v.weight_kg) : null));
    const bmi = vitals.map((v) => (v.bmi != null ? Number(v.bmi) : null));

    const firstLast = (arr: (number | null)[]) => {
        const f = arr.find((x) => x !== null) ?? null;
        const l = [...arr].reverse().find((x) => x !== null) ?? null;
        return { f, l };
    };
    const bpFL = firstLast(sys);
    const wtFL = firstLast(wt);
    const bmiFL = firstLast(bmi);
    const lastSys = [...sys].reverse().find((x) => x !== null) ?? null;
    const lastDia = [...dia].reverse().find((x) => x !== null) ?? null;

    const sysLine = { ...buildLine(sys), color: "#ef4444" };
    const diaLine = { ...buildLine(dia), color: "#3b82f6" };
    const wtLine = { ...buildLine(wt), color: "#10b981" };
    const bmiLine = { ...buildLine(bmi), color: "#8b5cf6" };

    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-[#2B54F0]" />
                <h3 className="text-sm font-bold text-slate-800">แนวโน้มสัญญาณชีพ</h3>
                <span className="text-xs text-slate-400">({vitals.length} ครั้ง)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MiniChart
                    icon={HeartPulse} title="ความดัน (BP)"
                    latest={lastSys !== null ? `${lastSys}/${lastDia ?? "—"}` : "—"} unit=""
                    lines={[sysLine, diaLine]} first={bpFL.f} last={bpFL.l} invert
                />
                <MiniChart
                    icon={Weight} title="น้ำหนัก" unit=" kg"
                    latest={wtFL.l !== null ? `${wtFL.l} kg` : "—"}
                    lines={[wtLine]} first={wtFL.f} last={wtFL.l} invert
                />
                <MiniChart
                    icon={Activity} title="BMI"
                    latest={bmiFL.l !== null ? `${bmiFL.l}` : "—"}
                    lines={[bmiLine]} first={bmiFL.f} last={bmiFL.l} invert
                />
            </div>
            <p className="text-[11px] text-slate-400 mt-3">🔴 BP ตัวบน · 🔵 BP ตัวล่าง — เรียงจากเก่า→ใหม่ (ซ้าย→ขวา)</p>
        </div>
    );
}
