import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// ตั้งชื่อ tab/ไฟล์ PDF = HN-ฉลากยา
export async function generateMetadata(
    { params }: { params: Promise<{ vn: string }> }
): Promise<Metadata> {
    const { vn } = await params;
    try {
        const supabase = await createClient();
        const { data } = await supabase.from("visits").select("hn").eq("vn", vn).maybeSingle();
        if (data?.hn) return { title: `${data.hn}-ฉลากยา` };
    } catch { /* fallback */ }
    return { title: "ฉลากยา" };
}

function dateThai(d: string | null | undefined): string {
    const base = d ? new Date(d) : new Date();
    return base.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

function calcAge(dob?: string | null): string {
    if (!dob) return "—";
    const d = new Date(dob), n = new Date();
    let y = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) y--;
    return String(y);
}

// หน่วยขนาดยาเป็นไทย
function thUnit(u?: string | null): string {
    const map: Record<string, string> = { tablet: "เม็ด", tab: "เม็ด", capsule: "แคปซูล", cap: "แคปซูล", bottle: "ขวด", ml: "มล.", sachet: "ซอง" };
    const k = (u || "").trim().toLowerCase();
    return map[k] || (u || "").trim();
}

// แกะวิธีใช้ (sig_text) เป็นช่องติ๊ก
function parseSig(sig: string) {
    const s = sig || "";
    const doseM = s.match(/ครั้งละ\s*([0-9]+(?:[.\-/][0-9]+)?)/);
    const everyM = s.match(/ทุก\s*ๆ?\s*([0-9]+)\s*(?:ชั่วโมง|ชม)/);
    return {
        dose: doseM ? doseM[1] : "",
        everyH: everyM ? everyM[1] : "",
        beforeMeal: /ก่อนอาหาร/.test(s),
        afterMeal: /หลังอาหาร/.test(s),
        withMeal: /พร้อมอาหาร/.test(s),
        morning: /เช้า/.test(s),
        noon: /กลางวัน|เที่ยง/.test(s),
        evening: /เย็น/.test(s),
        bedtime: /ก่อนนอน/.test(s),
        prn: /เมื่อมีอาการ|PRN/i.test(s),
    };
}

// ─── ไอคอนเวลา (inline SVG ใช้ได้ตอนพิมพ์) ───
const SV = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IcSunrise = () => <svg {...SV}><path d="M3 18h18M12 9V3M9 6l3-3 3 3" /><path d="M7 18a5 5 0 0 1 10 0" /></svg>;
const IcSun = () => <svg {...SV}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4" /></svg>;
const IcSunset = () => <svg {...SV}><path d="M3 18h18M12 3v6M9 6l3 3 3-3" /><path d="M7 18a5 5 0 0 1 10 0" /></svg>;
const IcMoon = () => <svg {...SV}><path d="M18 15A7 7 0 1 1 9 6a5.5 5.5 0 0 0 9 9z" /></svg>;

const Box = ({ on }: { on?: boolean }) => <span style={{ fontFamily: "sans-serif" }}>{on ? "☑" : "☐"}</span>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickInv(d: any) {
    return Array.isArray(d.inventory) ? d.inventory[0] : d.inventory;
}

export default async function DrugLabelsPrintPage({ params }: { params: Promise<{ vn: string }> }) {
    await gatePermission("pharmacy.view");
    const { vn } = await params;
    const supabase = await createClient();

    const { data: visit } = await supabase
        .from("visits")
        .select(`vn, hn, visit_date, clinic_id, patients ( prefix, first_name, last_name, dob )`)
        .eq("vn", vn)
        .maybeSingle();

    if (!visit) return <div className="p-10 text-center text-slate-500">ไม่พบ Visit นี้</div>;

    const { data: drugOrders } = await supabase
        .from("drug_orders")
        .select(`id, qty, unit, sig_text, inventory!inner ( item_name, generic_name, strength, indication, warning_label )`)
        .eq("vn", vn)
        .order("id");

    const drugs = drugOrders || [];

    const [{ data: clinic }, { data: branch }] = await Promise.all([
        supabase.from("tenants").select("clinic_name, address_detail, license_number").eq("id", visit.clinic_id).maybeSingle(),
        supabase.from("branches").select("branch_name, phone").eq("clinic_id", visit.clinic_id)
            .eq("is_active", true).order("sort_order").limit(1).maybeSingle(),
    ]);

    const pt = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
    const ptName = pt ? `${pt.prefix || ""}${pt.first_name || ""} ${pt.last_name || ""}`.trim() : "—";
    const ptAge = calcAge(pt?.dob);
    const clinicName = (clinic?.clinic_name as string) || "คลินิก";
    const clinicAddr = (clinic?.address_detail as string) || "";
    const phone = (branch?.phone as string) || "";
    const dateStr = dateThai(visit.visit_date);

    if (drugs.length === 0) {
        return <div className="p-10 text-center text-slate-500">Visit นี้ไม่มีรายการยา (ไม่มีอะไรให้พิมพ์ฉลาก)</div>;
    }

    const dotLine = { flex: 1, borderBottom: "1px dotted #888", minWidth: "10px", marginLeft: "3px" } as const;

    return (
        <>
            <div className="no-print mx-auto" style={{ maxWidth: "80mm" }}><PrintTrigger /></div>

            <div style={{ fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                {drugs.map((d, i) => {
                    const inv = pickInv(d);
                    const name = inv?.item_name || "ยา";
                    const strength = inv?.strength || "";
                    const generic = inv?.generic_name || "";
                    const indication = inv?.indication || "";
                    const warning = inv?.warning_label || "";
                    const sig = (d.sig_text || "").trim();
                    const g = parseSig(sig);
                    const doseNum = g.dose || String(d.qty ?? "");
                    const unitTh = thUnit(d.unit);
                    const slots = [
                        { on: g.morning, label: "เช้า", Icon: IcSunrise },
                        { on: g.noon, label: "กลางวัน", Icon: IcSun },
                        { on: g.evening, label: "เย็น", Icon: IcSunset },
                        { on: g.bedtime, label: "ก่อนนอน", Icon: IcMoon },
                    ];
                    return (
                        <div key={d.id} className={`label${i < drugs.length - 1 ? " label-break" : ""}`}>
                            {/* ── เนื้อหาหลัก ── */}
                            <div className="lmain">
                                {/* ผู้ป่วย */}
                                <div style={{ display: "flex", alignItems: "baseline", fontSize: "11px" }}>
                                    <span style={{ fontWeight: 700 }}>ชื่อ</span>
                                    <span style={dotLine}>{ptName}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "baseline", fontSize: "11px", marginTop: "1px" }}>
                                    <span style={{ fontWeight: 700 }}>อายุ</span><span style={{ ...dotLine, maxWidth: "34px" }}>{ptAge}</span>
                                    <span style={{ fontWeight: 700, marginLeft: "6px" }}>HN</span><span style={{ ...dotLine, fontFamily: "monospace" }}>{visit.hn}</span>
                                    <span style={{ fontWeight: 700, marginLeft: "6px" }}>วันที่</span><span style={dotLine}>{dateStr}</span>
                                </div>

                                <div style={{ borderTop: "1.5px solid #000", margin: "4px 0 3px" }} />

                                {/* ชื่อยา */}
                                <div style={{ fontSize: "17px", fontWeight: 900, lineHeight: 1.05 }}>
                                    {name} {strength && <span style={{ fontSize: "13px" }}>{strength}</span>}
                                </div>
                                {(generic || indication) && (
                                    <div style={{ fontSize: "10px", color: "#555", fontStyle: "italic", lineHeight: 1.1 }}>
                                        {generic}{generic && indication ? " · " : ""}{indication}
                                    </div>
                                )}

                                {/* วิธีใช้: ครั้งละ + มื้อ */}
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px", fontSize: "12px" }}>
                                    <span style={{ fontWeight: 700, fontSize: "10px", color: "#444" }}>วิธีใช้</span>
                                    <span>ครั้งละ <span style={{ fontWeight: 800, borderBottom: "1px solid #000", padding: "0 5px" }}>{doseNum || "…"}</span> {unitTh}</span>
                                    <span style={{ marginLeft: "auto", fontSize: "11.5px" }}>
                                        <Box on={g.beforeMeal} /> ก่อนอาหาร &nbsp; <Box on={g.afterMeal} /> หลังอาหาร
                                    </span>
                                </div>

                                {/* ช่วงเวลา (ไอคอน) */}
                                <div style={{ display: "flex", gap: "4px", marginTop: "5px" }}>
                                    {slots.map(sl => (
                                        <span key={sl.label} style={{
                                            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "1px",
                                            border: "1.5px solid #000", borderRadius: "7px", padding: "3px 0", fontSize: "11px",
                                            background: sl.on ? "#000" : "#fff", color: sl.on ? "#fff" : "#000", fontWeight: sl.on ? 700 : 400,
                                        }}>
                                            <sl.Icon />{sl.label}
                                        </span>
                                    ))}
                                </div>

                                {/* ความถี่ */}
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "5px", fontSize: "11.5px" }}>
                                    <span><Box on={!!g.everyH} /> ทุกๆ <span style={{ borderBottom: "1px solid #000", padding: "0 6px", fontWeight: 800 }}>{g.everyH || "…"}</span> ชม.</span>
                                    <span><Box on={g.prn} /> เมื่อมีอาการ</span>
                                </div>

                                {/* วิธีใช้เต็ม (กันพลาดจากการแกะ) */}
                                {sig && <div style={{ fontSize: "9.5px", color: "#333", marginTop: "3px", lineHeight: 1.15 }}>“{sig}”</div>}

                                {/* คำเตือน */}
                                <div style={{ display: "flex", alignItems: "baseline", fontSize: "10px", marginTop: "auto", color: "#444" }}>
                                    <span style={{ fontWeight: 700, color: "#c00" }}>คำเตือน</span>
                                    <span style={dotLine}>{warning}</span>
                                    <span style={{ fontWeight: 700, marginLeft: "5px", whiteSpace: "nowrap" }}>จำนวนจ่าย {Number(d.qty || 0)} {unitTh}</span>
                                </div>
                            </div>

                            {/* ── กล่องคลินิก (ดำ) ── */}
                            <div className="lside">
                                <div style={{ fontSize: "22px", fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1 }}>
                                    ธนเวช<span style={{ fontSize: "13px", verticalAlign: "super" }}>+</span>
                                </div>
                                <div style={{ fontSize: "10.5px", fontWeight: 700, lineHeight: 1.15, marginTop: "3px" }}>{clinicName}</div>
                                {clinicAddr && <div style={{ fontSize: "8px", lineHeight: 1.3, opacity: 0.92, marginTop: "3px" }}>{clinicAddr}</div>}
                                <div style={{ fontSize: "8.5px", fontWeight: 700, marginTop: "auto", lineHeight: 1.4 }}>
                                    {phone && <>โทร {phone}</>}
                                    {clinic?.license_number && <div style={{ fontWeight: 400, opacity: 0.85 }}>ใบอนุญาต {clinic.license_number}</div>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="no-print text-center text-[11px] text-slate-400 mt-2">
                ฉลากยา {drugs.length} ดวง · กระดาษ 8×6 ซม. (1 ดวง/แผ่น) · ช่องติ๊กมาจากวิธีใช้อัตโนมัติ
            </p>

            <style>{`
                .label {
                    width: 80mm;
                    height: 60mm;
                    box-sizing: border-box;
                    background: white;
                    display: flex;
                    gap: 0;
                    overflow: hidden;
                }
                .lmain { flex: 1; min-width: 0; padding: 3.5mm 3mm; display: flex; flex-direction: column; }
                .lside {
                    width: 21mm; flex-shrink: 0; background: #0f0f0f; color: #fff;
                    border-radius: 4mm; margin: 2mm; padding: 3mm 2mm;
                    display: flex; flex-direction: column; align-items: center; text-align: center;
                }
                .label-break { break-after: page; page-break-after: always; }
                @media print {
                    .no-print { display: none !important; }
                    @page { size: 80mm 60mm; margin: 0; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .label { margin: 0; }
                }
                @media screen {
                    body { background: #f1f5f9; }
                    .label { box-shadow: 0 4px 20px rgba(0,0,0,0.12); margin: 16px auto; border: 1px solid #000; border-radius: 6px; }
                }
            `}</style>
        </>
    );
}
