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
    if (!d) return "";
    const base = new Date(d);
    if (isNaN(base.getTime())) return "";
    return base.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

function calcAge(dob?: string | null): string {
    if (!dob) return "—";
    const d = new Date(dob), n = new Date();
    let y = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) y--;
    return String(y);
}

// หน่วยยาเป็นไทย (คลังอาจเก็บเป็น Tablet/Capsule)
function thUnit(u?: string | null): string {
    const map: Record<string, string> = { tablet: "เม็ด", tab: "เม็ด", capsule: "แคปซูล", cap: "แคปซูล", bottle: "ขวด", ml: "มล.", sachet: "ซอง", tube: "หลอด", amp: "แอมป์", vial: "ขวด" };
    const k = (u || "").trim().toLowerCase();
    return map[k] || (u || "").trim();
}

// ประเภทยาที่ต้องมีเครื่องหมายเตือน
const DANGEROUS = ["ยาอันตราย", "ยาควบคุมพิเศษ", "วัตถุออกฤทธิ์", "ยาเสพติด"];

// เครื่องหมายเตือน (inline SVG — พิมพ์ได้ ไม่ใช่ emoji)
const IcWarn = ({ size = 13 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "-2px" }}>
        <path d="M12 2 1 21h22L12 2zm0 6c.55 0 1 .45 1 1v5a1 1 0 0 1-2 0V9c0-.55.45-1 1-1zm0 9a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" />
    </svg>
);

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
        .select(`id, item_id, qty, unit, sig_text, inventory!inner ( item_name, generic_name, strength, indication, warning_label, label_type, expiry_date )`)
        .eq("vn", vn)
        .order("id");

    const drugs = drugOrders || [];

    // วันหมดอายุ: อ่านจากล็อต (inventory_lots) ที่ยังมีของ เลือกวันใกล้สุด (FEFO)
    // แม่นกว่า inventory.expiry_date ที่ sync เฉพาะตอนตัดสต๊อก (รับล็อตเข้าไม่ได้ sync)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemIds = [...new Set(drugs.map((d: any) => d.item_id).filter(Boolean))] as string[];
    const expiryMap: Record<string, string> = {};
    if (itemIds.length > 0) {
        const { data: lots } = await supabase.from("inventory_lots")
            .select("item_id, expiry_date")
            .in("item_id", itemIds)
            .gt("qty_remaining", 0)
            .not("expiry_date", "is", null)
            .order("expiry_date", { ascending: true });
        for (const l of lots || []) {
            const k = l.item_id as string;
            if (!expiryMap[k]) expiryMap[k] = l.expiry_date as string;   // แถวแรก = ใกล้สุด (order asc)
        }
    }

    const [{ data: clinic }, { data: branch }] = await Promise.all([
        supabase.from("tenants").select("clinic_name, address_detail, phone, logo_url").eq("id", visit.clinic_id).maybeSingle(),
        supabase.from("branches").select("branch_name, phone").eq("clinic_id", visit.clinic_id)
            .eq("is_active", true).order("sort_order").limit(1).maybeSingle(),
    ]);

    const pt = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
    const ptName = pt ? `${pt.prefix || ""}${pt.first_name || ""} ${pt.last_name || ""}`.trim() : "—";
    const ptAge = calcAge(pt?.dob);
    const clinicName = (clinic?.clinic_name as string) || "คลินิก";
    const clinicAddr = (clinic?.address_detail as string) || "";
    const phone = (branch?.phone as string) || (clinic?.phone as string) || "";
    const logoUrl = (clinic?.logo_url as string) || "/clinic-logo.png";
    const dateStr = dateThai(visit.visit_date);

    if (drugs.length === 0) {
        return <div className="p-10 text-center text-slate-500">Visit นี้ไม่มีรายการยา (ไม่มีอะไรให้พิมพ์ฉลาก)</div>;
    }

    return (
        <>
            <div className="no-print mx-auto" style={{ maxWidth: "80mm" }}><PrintTrigger /></div>

            <div style={{ fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                {drugs.map((d, i) => {
                    const inv = pickInv(d);
                    const name = inv?.item_name || "ยา";
                    const strength = (inv?.strength || "").trim();
                    // ไม่แสดงความแรงซ้ำถ้าชื่อยามีอยู่แล้ว
                    const norm = (x: string) => x.replace(/\s/g, "").toLowerCase();
                    const showStrength = strength && !norm(name).includes(norm(strength));
                    const generic = inv?.generic_name || "";
                    const indication = inv?.indication || "";
                    const warning = (inv?.warning_label || "").trim();
                    const labelType = (inv?.label_type || "").trim();
                    const dangerous = DANGEROUS.includes(labelType);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const exp = dateThai(expiryMap[(d as any).item_id] || inv?.expiry_date);
                    const sig = (d.sig_text || "").trim() || "ใช้ตามแพทย์สั่ง";
                    return (
                        <div key={d.id} className={`label${i < drugs.length - 1 ? " label-break" : ""}`}>
                            {/* ── หัวคลินิก (บนสุด) — โลโก้จริง ── */}
                            <div style={{ display: "flex", alignItems: "center", gap: "2.5mm" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={logoUrl} alt="" style={{ height: "11mm", width: "11mm", objectFit: "contain", flexShrink: 0 }} />
                                <div style={{ minWidth: 0, lineHeight: 1.2 }}>
                                    <div style={{ fontSize: "13px", fontWeight: 800 }}>{clinicName}</div>
                                    {clinicAddr && <div style={{ fontSize: "8.5px", color: "#444" }}>{clinicAddr}</div>}
                                    {phone && <div style={{ fontSize: "8.5px", color: "#444" }}>โทร {phone}</div>}
                                </div>
                            </div>

                            <div style={{ borderTop: "1.5px solid #000", margin: "2mm 0 1.5mm" }} />

                            {/* ── ผู้ป่วย ── */}
                            <div style={{ fontSize: "11.5px" }}><span style={{ fontWeight: 700 }}>ชื่อ</span> {ptName}</div>
                            <div style={{ fontSize: "10.5px", color: "#333", marginTop: "0.5mm" }}>
                                <span style={{ fontWeight: 700 }}>อายุ</span> {ptAge}
                                <span style={{ margin: "0 4px", color: "#bbb" }}>·</span>
                                <span style={{ fontWeight: 700 }}>HN</span> <span style={{ fontFamily: "monospace" }}>{visit.hn}</span>
                                <span style={{ margin: "0 4px", color: "#bbb" }}>·</span>
                                <span style={{ fontWeight: 700 }}>วันที่</span> {dateStr}
                            </div>

                            {/* ── ชื่อยา + เครื่องหมายยาอันตราย ── */}
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap", marginTop: "1.5mm" }}>
                                <span style={{ fontSize: "17px", fontWeight: 900, lineHeight: 1.05 }}>
                                    {name}{showStrength ? ` ${strength}` : ""}
                                </span>
                                {dangerous && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "10px", fontWeight: 700, color: "#fff", background: "#c0161d", borderRadius: "4px", padding: "1px 6px" }}>
                                        <IcWarn size={11} /> {labelType}
                                    </span>
                                )}
                            </div>
                            {(generic || indication) && (
                                <div style={{ fontSize: "10px", color: "#555", fontStyle: "italic", lineHeight: 1.15 }}>
                                    {generic}{generic && indication ? " · " : ""}{indication}
                                </div>
                            )}

                            {/* ── วิธีใช้ (ข้อความจากระบบ) ── */}
                            <div style={{ fontSize: "14px", marginTop: "2mm", lineHeight: 1.3 }}>
                                <span style={{ fontWeight: 700, fontSize: "11px", color: "#444" }}>วิธีใช้ </span>
                                <span style={{ fontWeight: 700 }}>{sig}</span>
                            </div>

                            {/* ── meta: วันหมดอายุ · ประเภท · จำนวน ── */}
                            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", fontSize: "10.5px", color: "#333", marginTop: "auto", paddingTop: "1.5mm", borderTop: "1px dotted #bbb" }}>
                                {exp && <span><span style={{ fontWeight: 700 }}>วันหมดอายุ</span> {exp}</span>}
                                {labelType && !dangerous && <span><span style={{ fontWeight: 700 }}>ประเภท</span> {labelType}</span>}
                                <span style={{ marginLeft: "auto", fontWeight: 700 }}>จำนวน {Number(d.qty || 0)} {thUnit(d.unit)}</span>
                            </div>
                            {warning && (
                                <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#c0161d", marginTop: "1mm" }}>
                                    <IcWarn /> คำเตือน: {warning}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="no-print text-center text-[11px] text-slate-400 mt-2">
                ฉลากยา {drugs.length} ดวง · กระดาษ 8×6 ซม. (1 ดวง/แผ่น)
            </p>

            <style>{`
                .label {
                    width: 80mm;
                    height: 60mm;
                    box-sizing: border-box;
                    background: white;
                    padding: 3mm 3.5mm;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
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
