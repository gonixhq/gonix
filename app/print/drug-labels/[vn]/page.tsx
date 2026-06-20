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
        .select(`vn, hn, visit_date, clinic_id, patients ( prefix, first_name, last_name )`)
        .eq("vn", vn)
        .maybeSingle();

    if (!visit) return <div className="p-10 text-center text-slate-500">ไม่พบ Visit นี้</div>;

    const { data: drugOrders } = await supabase
        .from("drug_orders")
        .select(`id, qty, unit, sig_text, inventory!inner ( item_name, generic_name, strength )`)
        .eq("vn", vn)
        .order("id");

    const drugs = drugOrders || [];

    const [{ data: clinic }, { data: branch }] = await Promise.all([
        supabase.from("tenants").select("clinic_name").eq("id", visit.clinic_id).maybeSingle(),
        supabase.from("branches").select("branch_name, phone").eq("clinic_id", visit.clinic_id)
            .eq("is_active", true).order("sort_order").limit(1).maybeSingle(),
    ]);

    const pt = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
    const ptName = pt ? `${pt.prefix || ""}${pt.first_name || ""} ${pt.last_name || ""}`.trim() : "—";
    const clinicName = (clinic?.clinic_name as string) || "คลินิก";
    const phone = (branch?.phone as string) || "";
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
                    const strength = inv?.strength || "";
                    const generic = inv?.generic_name || "";
                    const sig = (d.sig_text || "").trim() || "ใช้ตามแพทย์สั่ง";
                    return (
                        <div key={d.id} className={`label${i < drugs.length - 1 ? " label-break" : ""}`}>
                            {/* หัวฉลาก: ชื่อคลินิก + วันที่ */}
                            <div className="flex items-baseline justify-between gap-2 border-b border-slate-300 pb-[1mm]">
                                <span className="text-[12px] font-bold truncate">{clinicName}</span>
                                <span className="text-[11px] text-slate-600 shrink-0">{dateStr}</span>
                            </div>

                            {/* ผู้ป่วย */}
                            <div className="flex items-baseline justify-between gap-2 mt-[1.5mm]">
                                <span className="text-[14px] font-semibold truncate">{ptName}</span>
                                <span className="text-[11px] font-mono text-slate-600 shrink-0">HN {visit.hn}</span>
                            </div>

                            {/* ชื่อยา */}
                            <div className="mt-[2mm]">
                                <div className="text-[19px] font-black leading-tight">
                                    {name} {strength && <span className="text-[14px] font-bold">{strength}</span>}
                                </div>
                                {generic && generic !== name && (
                                    <div className="text-[11px] text-slate-500 leading-tight italic">{generic}</div>
                                )}
                            </div>

                            {/* วิธีใช้ (สำคัญสุด) */}
                            <div className="mt-[2mm] flex gap-[2mm]">
                                <span className="text-[12px] font-bold text-slate-500 shrink-0 mt-[1px]">วิธีใช้</span>
                                <span className="text-[17px] font-bold leading-snug">{sig}</span>
                            </div>

                            {/* จำนวน + เบอร์คลินิก */}
                            <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-dashed border-slate-300 pt-[1mm]">
                                <span className="text-[12px]">จำนวน <span className="font-bold">{Number(d.qty || 0)}</span> {d.unit || ""}</span>
                                {phone && <span className="text-[10px] text-slate-500 shrink-0">โทร {phone}</span>}
                            </div>
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
                    padding: 4mm;
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
                    .label { box-shadow: 0 4px 20px rgba(0,0,0,0.12); margin: 16px auto; }
                }
            `}</style>
        </>
    );
}
