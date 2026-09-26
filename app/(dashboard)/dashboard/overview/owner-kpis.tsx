import Link from "next/link";
import { getFinanceKpis } from "@/lib/actions/finance-kpis";
import { Target, TrendingUp, Users, Megaphone, Sparkles, Layers, PiggyBank, Landmark, AlertTriangle } from "lucide-react";

const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;

// KPI หน้าแรก (เฟส 5C) — เฉพาะเจ้าของ · ตัวเลขเพื่อบริหาร (ภาษีเป็นประมาณการ)
export default async function OwnerKpis() {
    const k = await getFinanceKpis();
    if ("error" in k) return null;
    const bePct = k.breakEven ? Math.min(100, k.revenueToDate / k.breakEven * 100) : 0;
    const pacePct = k.daysElapsed / k.daysInMonth * 100;
    const behind = k.breakEven != null && bePct < pacePct;

    return (
        <section className="space-y-3" data-widget="owner-kpis">
            <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-700 flex-1">KPI การเงิน (เจ้าของ)</h2>
                <Link href="/dashboard/finance/monthly-report" className="text-xs text-blue-700 hover:underline">รายงานรายเดือน ›</Link>
            </div>

            {/* จุดคุ้มทุน */}
            <div className="rounded-2xl bg-white/85 border border-white/90 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-blue-700" />
                    <span className="text-sm font-bold text-slate-800 flex-1">จุดคุ้มทุนเดือนนี้</span>
                    <span className="text-xs text-slate-500">วันที่ {k.daysElapsed}/{k.daysInMonth}</span>
                </div>
                {k.breakEven == null ? (
                    <p className="text-xs text-slate-500">ยังคำนวณไม่ได้ — ต้องมีข้อมูลรายได้/ต้นทุนเดือนก่อนหน้า (ตั้งต้นทุนคงที่ + สูตรหัตถการ)</p>
                ) : (
                    <>
                        <div className="relative h-4 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${bePct >= 100 ? "bg-emerald-500" : behind ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${bePct}%` }} />
                            <div className="absolute top-0 h-full w-0.5 bg-slate-500" style={{ left: `${pacePct}%` }} title="ควรอยู่ตรงนี้ตามจำนวนวัน" />
                        </div>
                        <div className="flex justify-between flex-wrap gap-2 mt-1.5 text-xs">
                            <span>ทำได้ <b className="tabular-nums">{baht(k.revenueToDate)}</b> / คุ้มทุน <b className="tabular-nums">{baht(k.breakEven)}</b> ({Math.round(bePct)}%)</span>
                            <span className={bePct >= 100 ? "text-emerald-700 font-bold" : behind ? "text-amber-700 font-semibold" : "text-slate-500"}>
                                {bePct >= 100 ? `เกินจุดคุ้มทุน · กำไรเดือนนี้ ${baht(k.profitToDate)}` : `ขาดอีก ${baht(k.breakEven - k.revenueToDate)}${behind ? " · ช้ากว่าเป้าตามวัน" : ""}`}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">ต้นทุนคงที่ ≈ {baht(k.fixedBase)}/เดือน · กำไรส่วนเกิน {k.cmRatio}% ของรายได้ (เฉลี่ย 3 เดือนล่าสุด)</p>
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* มาร์จิ้นแยกหมวด */}
                <Card icon={TrendingUp} title="มาร์จิ้นแยกหมวด (บิลเดือนนี้)" href="/dashboard/finance/procedure-costs">
                    {k.segMargins.length === 0 ? <Muted>ยังไม่มีบิล</Muted> : k.segMargins.map(s => (
                        <Line key={s.segment} label={s.segment} value={`${s.margin}%`} warn={s.margin < k.threshold} sub={baht(s.revenue)} />
                    ))}
                    {k.lowItems.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                            <div className="text-[11px] text-rose-600 font-semibold inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> ต่ำกว่าเกณฑ์ {k.threshold}%</div>
                            {k.lowItems.map(i => <div key={i.name} className="flex justify-between text-[11px] text-slate-600"><span className="truncate pr-2">{i.name}</span><span className="tabular-nums text-rose-600">{i.margin}%</span></div>)}
                        </div>
                    )}
                </Card>

                {/* ลูกค้า */}
                <Card icon={Users} title="ลูกค้าเดือนนี้">
                    <Line label="ลูกค้าใหม่" value={k.customers.new.toLocaleString()} />
                    <Line label="กลับมาซ้ำ" value={k.customers.returning.toLocaleString()} />
                    <Line label="ค่าเฉลี่ยต่อบิล" value={baht(k.customers.avgBill)} sub={`${k.customers.bills} บิล`} />
                </Card>

                {/* CAC */}
                <Card icon={Megaphone} title="ต้นทุนต่อลูกค้าใหม่" href="/dashboard/affiliates/cac">
                    <div className="text-2xl font-black tabular-nums text-slate-800">{k.cac != null ? baht(k.cac) : "—"}</div>
                    <Muted>การตลาดทั้งหมด {baht(k.marketingCost)} (แอด + เคสรีวิว + ประจำ) ÷ ลูกค้าใหม่ {k.customers.new}</Muted>
                </Card>

                {/* คอร์สค้าง */}
                <Card icon={Sparkles} title="มูลค่าคอร์สค้างใช้" href="/dashboard/packages">
                    <div className="text-2xl font-black tabular-nums text-violet-700">{baht(k.courses.outstanding)}</div>
                    <Muted>{k.courses.count} คอส{k.courses.expiring30 > 0 ? ` · ใกล้หมดอายุใน 30 วัน ${k.courses.expiring30} คอส (โทรตาม)` : ""}</Muted>
                </Card>

                {/* คอมทีม */}
                <Card icon={Layers} title="ขั้นคอมทีมเดือนนี้" href="/dashboard/finance/team-commission">
                    <div className="text-2xl font-black tabular-nums text-slate-800">{k.team.tierPct ? `${k.team.tierPct}%` : "ยังไม่ถึงขั้น"}</div>
                    <Muted>ฐานความงาม {baht(k.team.base)}{k.team.gap != null ? ` · อีก ${baht(k.team.gap)} ถึงขั้น ${k.team.nextPct}%` : ""}</Muted>
                </Card>

                {/* เงินสำรอง */}
                <Card icon={PiggyBank} title="เงินสำรอง" href="/dashboard/settings/finance-rates">
                    {k.reserve.months == null ? (
                        <Muted>ยังไม่ได้ตั้งยอดเงินสำรอง — ตั้งที่อัตราการเงิน (KPI)</Muted>
                    ) : (
                        <>
                            <div className={`text-2xl font-black tabular-nums ${k.reserve.months < 3 ? "text-rose-600" : "text-emerald-700"}`}>{k.reserve.months} เดือน</div>
                            <Muted>{baht(k.reserve.cash || 0)} ÷ ต้นทุนคงที่ {baht(k.reserve.monthlyFixed)}/เดือน · ควรมีอย่างน้อย 3 เดือน</Muted>
                        </>
                    )}
                </Card>
            </div>

            {/* ภาษี */}
            <div className="rounded-2xl bg-white/85 border border-white/90 shadow-sm p-4 flex items-center gap-4 flex-wrap">
                <Landmark className="h-5 w-5 text-slate-500" />
                <div className="flex-1 min-w-[200px]">
                    <div className="text-sm font-bold text-slate-800">ภาษีเงินได้นิติบุคคล (ประมาณการ · อัตรา SME)</div>
                    <div className="text-[11px] text-slate-400">กำไร 300,000 แรกยกเว้น · 300,001–3 ล้าน 15% · เกิน 3 ล้าน 20% — ตัวเลขจริงยืนยันกับสำนักงานบัญชี</div>
                </div>
                <div className="text-xs text-right">
                    <div>กำไรสะสมปีนี้ <b className="tabular-nums">{baht(k.tax.ytdProfit)}</b> → ภาษี <b className="tabular-nums">{baht(k.tax.ytdTax)}</b></div>
                    <div className="text-slate-500">ถ้าทั้งปีเป็นแบบนี้ ≈ กำไร {baht(k.tax.projectedProfit)} → ภาษี <b className="tabular-nums text-slate-700">{baht(k.tax.projectedTax)}</b></div>
                </div>
            </div>
        </section>
    );
}

function Card({ icon: Icon, title, href, children }: { icon: React.ElementType; title: string; href?: string; children: React.ReactNode }) {
    const head = <div className="flex items-center gap-2 mb-2"><Icon className="h-4 w-4 text-blue-700" /><span className="text-sm font-bold text-slate-800 flex-1">{title}</span>{href && <span className="text-xs text-slate-400">›</span>}</div>;
    return (
        <div className="rounded-2xl bg-white/85 border border-white/90 shadow-sm p-4">
            {href ? <Link href={href} className="block hover:opacity-80">{head}</Link> : head}
            {children}
        </div>
    );
}
function Line({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
    return (
        <div className="flex items-baseline justify-between text-sm py-0.5">
            <span className="text-slate-600">{label}{sub && <span className="text-[11px] text-slate-400 ml-1">{sub}</span>}</span>
            <span className={`tabular-nums font-bold ${warn ? "text-rose-600" : "text-slate-800"}`}>{value}</span>
        </div>
    );
}
function Muted({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] text-slate-500 mt-0.5">{children}</p>;
}
