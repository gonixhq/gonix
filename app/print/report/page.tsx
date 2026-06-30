import { gatePermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { getReportSummary } from "@/lib/actions/reports";
import { getBusinessInsights, getRfmAnalysis, getBasketAnalysis } from "@/lib/actions/business-insights";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────
// Labels
// ──────────────────────────────────────────────
const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: "เงินสด", transfer: "โอน", credit_card: "บัตรเครดิต", qr_promptpay: "QR / พร้อมเพย์",
    insurance: "ประกัน", nhso: "สปสช.", package: "หักจากคอส", points: "แต้มสะสม", mixed: "ผสม",
};
const ITEM_TYPE_LABEL: Record<string, string> = {
    drug: "ยา", supply: "เวชภัณฑ์", doctor_fee: "ค่าตรวจ", procedure: "หัตถการ", service: "บริการ",
    package: "คอสบริการ", lab: "แล็บ", lab_external: "แล็บภายนอก", fee: "ค่าธรรมเนียม/DF", other: "อื่นๆ",
};
const CATEGORY_LABEL: Record<string, string> = {
    general_med: "เวชกรรมทั่วไป", aesthetic: "ความงาม", wound_care: "ทำแผล",
    med_cert: "ใบรับรอง", checkup: "ตรวจสุขภาพ", std_test: "ตรวจ STD",
};

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0 })}`;
const baht2 = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("th-TH");
function dateThai(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
function bangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

type Section = "overview" | "sales" | "items" | "customers" | "behavior" | "all";
const SECTION_LABEL: Record<Section, string> = {
    overview: "ภาพรวม", sales: "ยอดขายตามประเภท", items: "รายการขายดี",
    customers: "ลูกค้า & ธุรกิจ", behavior: "พฤติกรรมการซื้อ", all: "รายงานฉบับเต็ม",
};

// Simple inline bar for print (ใช้ print-color-adjust: exact)
function Bar({ pct, color = "#2B54F0" }: { pct: number; color?: string }) {
    return (
        <div style={{ height: 8, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
        </div>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="text-[15px] font-black tracking-wide mt-6 mb-2" style={{ borderBottom: "2px solid #000", paddingBottom: 4 }}>
            {children}
        </h2>
    );
}

export default async function ReportPrintPage({
    searchParams,
}: {
    searchParams: Promise<{ start?: string; end?: string; section?: string }>;
}) {
    await gatePermission("reports.view");
    const sp = await searchParams;

    const today = bangkokToday();
    const [y, m] = today.split("-");
    const startDate = sp.start || `${y}-${m}-01`;
    const endDate = sp.end || today;
    const section = (["overview", "sales", "items", "customers", "behavior", "all"].includes(sp.section || "")
        ? sp.section : "all") as Section;
    const show = (s: Section) => section === "all" || section === s;
    const needBiz = show("customers");
    const needBasket = show("behavior");

    // Clinic info for masthead
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let clinic: { clinic_name?: string; clinic_name_en?: string; address_detail?: string; phone?: string; tax_id?: string } | null = null;
    if (user) {
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (profile?.clinic_id) {
            const { data } = await supabase.from("tenants")
                .select("clinic_name, clinic_name_en, address_detail, phone, tax_id")
                .eq("id", profile.clinic_id).maybeSingle();
            clinic = data;
        }
    }

    const [summary, biz, rfm, basket] = await Promise.all([
        getReportSummary(startDate, endDate),
        needBiz ? getBusinessInsights(startDate, endDate) : Promise.resolve(null),
        needBiz ? getRfmAnalysis() : Promise.resolve(null),
        needBasket ? getBasketAnalysis(startDate, endDate) : Promise.resolve(null),
    ]);

    const maxDay = Math.max(...summary.revenueByDay.map(r => r.amount), 1);
    const totalSales = summary.salesByType.reduce((s, t) => s + t.amount, 0);
    const totalMethod = summary.revenueByMethod.reduce((s, r) => s + Math.abs(r.amount), 0);
    const newPct = biz && biz.totalRevenue > 0 ? Math.round((biz.newRevenue / biz.totalRevenue) * 100) : 0;
    const retPct = 100 - newPct;

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}>
                <PrintTrigger />
            </div>

            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                {/* MASTHEAD */}
                <div style={{ borderTop: "4px double #000", borderBottom: "2px solid #000", padding: "8px 0" }}>
                    <div className="flex items-start justify-between gap-5">
                        <div className="flex items-center gap-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/clinic-logo.png" alt="Clinic" className="h-20 w-20 object-contain shrink-0" />
                            <div className="leading-tight">
                                <div className="text-[18px] font-black tracking-tight">{clinic?.clinic_name || "—"}</div>
                                {clinic?.clinic_name_en && <div className="text-[13px] font-semibold text-slate-800 mt-0.5">{clinic.clinic_name_en}</div>}
                                {clinic?.address_detail && <div className="text-[12px] text-slate-700 mt-1 leading-relaxed">{clinic.address_detail}</div>}
                                {clinic?.phone && <div className="text-[12px] text-slate-700">โทรศัพท์ {clinic.phone}</div>}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold text-slate-600">Report</div>
                            <h1 className="text-[22px] font-black tracking-tight text-black leading-tight mt-1">รายงานสรุปกิจการ</h1>
                            <div className="text-[13px] font-semibold text-slate-800">{SECTION_LABEL[section]}</div>
                            <div className="text-[12px] italic text-slate-700 mt-0.5">{dateThai(startDate)} — {dateThai(endDate)}</div>
                        </div>
                    </div>
                </div>

                {/* KEY FIGURES (แสดงเสมอ) */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                        { label: "รายรับ (ชำระจริง)", value: baht(summary.totalRevenue) },
                        { label: "ยอดออกบิล", value: baht(summary.totalBilled) },
                        { label: "ค้างชำระ", value: baht(summary.outstanding) },
                        { label: "จำนวนใบเสร็จ", value: `${num(summary.invoiceCount)} ใบ` },
                        { label: "Visit ทั้งหมด", value: `${num(summary.totalVisits)} ครั้ง` },
                        { label: "ลูกค้าใหม่ (ซื้อครั้งแรก)", value: `${num(summary.newPatients)} ราย` },
                    ].map((b) => (
                        <div key={b.label} className="border border-slate-300 rounded p-2.5">
                            <div className="text-[10px] text-slate-500">{b.label}</div>
                            <div className="text-[17px] font-black tabular-nums leading-tight mt-0.5">{b.value}</div>
                        </div>
                    ))}
                </div>

                {/* ── OVERVIEW ── */}
                {show("overview") && (
                    <>
                        <SectionTitle>รายรับรายวัน</SectionTitle>
                        {summary.revenueByDay.length === 0 ? (
                            <p className="text-[12px] text-slate-500 italic">ไม่มีรายรับในช่วงนี้</p>
                        ) : (
                            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                                <tbody>
                                    {summary.revenueByDay.map(r => (
                                        <tr key={r.date} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                            <td className="py-1 pr-3 text-slate-600" style={{ width: 90 }}>{dateThai(r.date)}</td>
                                            <td className="py-1 pr-3"><Bar pct={Math.round((r.amount / maxDay) * 100)} color="#10B981" /></td>
                                            <td className="py-1 text-right font-bold tabular-nums" style={{ width: 90 }}>{baht(r.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <SectionTitle>แยกตามวิธีชำระ</SectionTitle>
                        {summary.revenueByMethod.length === 0 ? (
                            <p className="text-[12px] text-slate-500 italic">ไม่มีข้อมูล</p>
                        ) : (
                            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1.5px solid #000" }} className="text-left">
                                        <th className="py-1.5">วิธีชำระ</th><th className="py-1.5 text-center">ครั้ง</th>
                                        <th className="py-1.5 text-right">ยอด</th><th className="py-1.5 text-right" style={{ width: 50 }}>%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.revenueByMethod.map(r => (
                                        <tr key={r.method} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                            <td className="py-1.5">{PAYMENT_METHOD_LABEL[r.method] || r.method}</td>
                                            <td className="py-1.5 text-center tabular-nums">{num(r.count)}</td>
                                            <td className="py-1.5 text-right font-bold tabular-nums">{baht(r.amount)}</td>
                                            <td className="py-1.5 text-right tabular-nums text-slate-500">{totalMethod > 0 ? Math.round((Math.abs(r.amount) / totalMethod) * 100) : 0}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {summary.revenueByCategory.length > 0 && (
                            <>
                                <SectionTitle>Visit แยกตามประเภทบริการ</SectionTitle>
                                <div className="grid grid-cols-4 gap-2">
                                    {summary.revenueByCategory.map(c => (
                                        <div key={c.category} className="border border-slate-300 rounded p-2 text-center">
                                            <div className="text-[18px] font-black tabular-nums">{num(c.count)}</div>
                                            <div className="text-[10px] text-slate-500">{CATEGORY_LABEL[c.category] || c.category}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* ── SALES ── */}
                {show("sales") && (
                    <>
                        <SectionTitle>ยอดขายแยกตามประเภทรายการ</SectionTitle>
                        {summary.salesByType.length === 0 ? (
                            <p className="text-[12px] text-slate-500 italic">ไม่มียอดขายในช่วงนี้</p>
                        ) : (
                            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1.5px solid #000" }} className="text-left">
                                        <th className="py-1.5">ประเภท</th><th className="py-1.5 text-center">รายการ</th>
                                        <th className="py-1.5 text-right">ยอดขาย</th><th className="py-1.5 text-right" style={{ width: 50 }}>%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.salesByType.map(t => {
                                        const pct = totalSales > 0 ? Math.round((t.amount / totalSales) * 100) : 0;
                                        return (
                                            <tr key={t.type} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                                <td className="py-1.5 font-semibold">{ITEM_TYPE_LABEL[t.type] || t.type}</td>
                                                <td className="py-1.5 text-center tabular-nums">{num(t.count)}</td>
                                                <td className="py-1.5 text-right font-bold tabular-nums">{baht2(t.amount)}</td>
                                                <td className="py-1.5 text-right tabular-nums text-slate-500">{pct}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: "1.5px solid #000" }}>
                                        <td className="py-1.5 font-black" colSpan={2}>รวม</td>
                                        <td className="py-1.5 text-right font-black tabular-nums">{baht2(totalSales)}</td>
                                        <td className="py-1.5 text-right">100%</td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </>
                )}

                {/* ── TOP ITEMS ── */}
                {show("items") && (
                    <>
                        <SectionTitle>รายการขายดี (Top {summary.topItems.length})</SectionTitle>
                        {summary.topItems.length === 0 ? (
                            <p className="text-[12px] text-slate-500 italic">ไม่มีรายการขายในช่วงนี้</p>
                        ) : (
                            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1.5px solid #000" }} className="text-left">
                                        <th className="py-1.5" style={{ width: 28 }}>#</th><th className="py-1.5">รายการ</th>
                                        <th className="py-1.5">ประเภท</th><th className="py-1.5 text-center">จำนวน</th>
                                        <th className="py-1.5 text-right">ยอดขาย</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.topItems.map((it, i) => (
                                        <tr key={i} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                            <td className="py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                                            <td className="py-1.5 font-semibold">{it.name}</td>
                                            <td className="py-1.5 text-slate-600">{ITEM_TYPE_LABEL[it.type] || it.type}</td>
                                            <td className="py-1.5 text-center tabular-nums">{num(it.qty)}</td>
                                            <td className="py-1.5 text-right font-bold tabular-nums">{baht2(it.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                )}

                {/* ── CUSTOMERS & BUSINESS ── */}
                {show("customers") && biz && rfm && (
                    <>
                        <SectionTitle>รายได้: ลูกค้าใหม่ vs เก่า</SectionTitle>
                        <div className="mb-2"><Bar pct={newPct} color="#2B54F0" /></div>
                        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1.5px solid #000" }} className="text-left">
                                    <th className="py-1.5">กลุ่ม</th><th className="py-1.5 text-center">จำนวนราย</th>
                                    <th className="py-1.5 text-right">รายได้</th><th className="py-1.5 text-right" style={{ width: 50 }}>%</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                    <td className="py-1.5 font-semibold">ลูกค้าใหม่</td>
                                    <td className="py-1.5 text-center tabular-nums">{num(biz.newCustomers)}</td>
                                    <td className="py-1.5 text-right font-bold tabular-nums">{baht(biz.newRevenue)}</td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500">{newPct}%</td>
                                </tr>
                                <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                    <td className="py-1.5 font-semibold">ลูกค้าเก่า</td>
                                    <td className="py-1.5 text-center tabular-nums">{num(biz.returningCustomers)}</td>
                                    <td className="py-1.5 text-right font-bold tabular-nums">{baht(biz.returningRevenue)}</td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500">{retPct}%</td>
                                </tr>
                            </tbody>
                        </table>

                        <SectionTitle>กลุ่มลูกค้า (RFM) · {num(rfm.total)} รายทั้งหมด</SectionTitle>
                        {rfm.segments.filter(s => s.customers > 0).length === 0 ? (
                            <p className="text-[12px] text-slate-500 italic">ยังมีข้อมูลลูกค้าไม่เพียงพอ</p>
                        ) : (
                            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1.5px solid #000" }} className="text-left">
                                        <th className="py-1.5">กลุ่มลูกค้า</th><th className="py-1.5 text-center">จำนวนราย</th>
                                        <th className="py-1.5 text-right">ยอดใช้จ่ายรวม</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rfm.segments.filter(s => s.customers > 0).map(s => (
                                        <tr key={s.key} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                            <td className="py-1.5 font-semibold">{s.label}</td>
                                            <td className="py-1.5 text-center tabular-nums">{num(s.customers)}</td>
                                            <td className="py-1.5 text-right font-bold tabular-nums">{baht(s.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <p className="text-[10px] text-slate-500 italic mt-2">
                            RFM แบ่งจาก Recency (ซื้อล่าสุด) · Frequency (ความถี่) · Monetary (ยอดใช้จ่าย) — ใช้วางแผนแคมเปญการตลาด
                        </p>
                    </>
                )}

                {/* ── PURCHASE BEHAVIOR ── */}
                {show("behavior") && basket && (
                    <>
                        <SectionTitle>สินค้า/บริการที่มักซื้อคู่กัน (Market Basket)</SectionTitle>
                        <p className="text-[11px] text-slate-500 mb-1">ใบเสร็จในช่วง {num(basket.totalBaskets)} ใบ · มี ≥2 รายการ {num(basket.multiItemBaskets)} ใบ</p>
                        {basket.pairs.length === 0 ? (
                            <p className="text-[12px] text-slate-500 italic">ยังไม่พบคู่ที่ซื้อร่วมกันบ่อยพอ (≥ 2 ครั้ง)</p>
                        ) : (
                            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1.5px solid #000" }} className="text-left">
                                        <th className="py-1.5">สินค้า A</th><th className="py-1.5">สินค้า B</th>
                                        <th className="py-1.5 text-center">ซื้อคู่กัน</th><th className="py-1.5 text-right" style={{ width: 50 }}>Lift</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {basket.pairs.map((p, i) => (
                                        <tr key={i} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                            <td className="py-1.5 font-semibold">{p.a}</td>
                                            <td className="py-1.5 font-semibold">{p.b}</td>
                                            <td className="py-1.5 text-center tabular-nums">{num(p.count)} ครั้ง</td>
                                            <td className="py-1.5 text-right tabular-nums">×{p.lift.toFixed(1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <SectionTitle>ซื้อแล้ว…ครั้งถัดไปมักซื้ออะไร</SectionTitle>
                        {basket.transitions.length === 0 ? (
                            <p className="text-[12px] text-slate-500 italic">ยังไม่พบลำดับการซื้อซ้ำมากพอ (≥ 2 ครั้ง)</p>
                        ) : (
                            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ borderBottom: "1.5px solid #000" }} className="text-left">
                                        <th className="py-1.5">ซื้อก่อน</th><th className="py-1.5">ครั้งถัดไป</th>
                                        <th className="py-1.5 text-center">จำนวนครั้ง</th><th className="py-1.5 text-right">เฉลี่ยห่าง</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {basket.transitions.map((t, i) => (
                                        <tr key={i} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                            <td className="py-1.5">{t.from}</td>
                                            <td className="py-1.5 font-semibold">{t.to}</td>
                                            <td className="py-1.5 text-center tabular-nums">{num(t.count)}</td>
                                            <td className="py-1.5 text-right tabular-nums">{Math.round(t.avgGapDays)} วัน</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                )}

                <div className="mt-8 text-[10px] text-slate-500 text-center italic" style={{ borderTop: "1px solid #cbd5e1", paddingTop: 6 }}>
                    รายงานนี้สร้างจากระบบ Gonix — พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </div>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4; margin: 12mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-page { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
                }
                @media screen {
                    .print-page { background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.1); margin: 20px auto; padding: 12mm; }
                    body { background: #f1f5f9; }
                }
            `}</style>
        </>
    );
}
