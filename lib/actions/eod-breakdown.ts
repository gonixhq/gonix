"use server";

import { createClient } from "@/lib/supabase/server";

// รายละเอียดบิลสำหรับหน้าปิดยอด: ใครเข้าเคส + DF/ค่ามือ/คอมแนะนำ/ส่วนลด ต่อรายการ
// ตัวเลขคิดจากยอดทั้งบิล (ถ้าจ่ายบางส่วน DF/คอมจริงคิดตามสัดส่วนที่จ่ายในแต่ละเดือน)

export interface BreakdownLine {
    name: string; qty: number; gross: number; discount: number; net: number;
    doctor: string | null; df: number;
    handMain: string | null; handMainFee: number; handAsst: string | null; handAsstFee: number;
    refComm: number; course: boolean;
}
export interface InvoiceBreakdown {
    invId: string; billType: string; subtotal: number; discount: number; total: number;
    visitDoctor: string | null; visitNurse: string | null; visitAssistant: string | null;
    refStaff: string | null; campaign: string | null;
    lines: BreakdownLine[];
    totals: { df: number; hand: number; refComm: number; discount: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] : x) ?? null;

export async function getInvoiceBreakdowns(invIds: string[]): Promise<Record<string, InvoiceBreakdown>> {
    const out: Record<string, InvoiceBreakdown> = {};
    try {
        const ids = [...new Set(invIds.filter(Boolean))].slice(0, 300);
        if (ids.length === 0) return out;
        const supabase = await createClient();
        const [{ data: heads }, { data: items }] = await Promise.all([
            supabase.from("invoice_headers").select("id, vn, bill_type, subtotal, discount_amount, total_amount, ref_staff_id, campaign").in("id", ids),
            supabase.from("invoice_items").select("inv_id, item_type, item_name, qty, line_total, discount_amount, performer_staff_id, df_pct, hand_main_staff_id, hand_asst_staff_id, hand_fee_main, hand_fee_asst, ref_comm_mode, ref_comm_value").in("inv_id", ids),
        ]);
        const vns = [...new Set((heads || []).map(h => h.vn as string).filter(Boolean))];
        const { data: visits } = vns.length
            ? await supabase.from("visits").select("vn, doctor_id, nurse_id, assistant_id").in("vn", vns)
            : { data: [] as { vn: string; doctor_id: string | null; nurse_id: string | null; assistant_id: string | null }[] };
        const visitMap = new Map((visits || []).map(v => [v.vn as string, v]));

        // ชื่อพนักงานทั้งหมดที่เกี่ยวข้อง
        const staffIds = new Set<string>();
        (heads || []).forEach(h => h.ref_staff_id && staffIds.add(h.ref_staff_id as string));
        (visits || []).forEach(v => [v.doctor_id, v.nurse_id, v.assistant_id].forEach(x => x && staffIds.add(x as string)));
        (items || []).forEach(i => [i.performer_staff_id, i.hand_main_staff_id, i.hand_asst_staff_id].forEach(x => x && staffIds.add(x as string)));
        const names = new Map<string, string>();
        if (staffIds.size) {
            const { data: st } = await supabase.from("staff").select("id, profiles(full_name)").in("id", [...staffIds]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (st || []).forEach((s: any) => names.set(s.id, one<{ full_name: string }>(s.profiles)?.full_name || "—"));
        }
        const nm = (id: unknown) => (id ? names.get(id as string) || "—" : null);

        for (const h of heads || []) {
            const its = (items || []).filter(i => i.inv_id === h.id);
            const invAfter = its.reduce((s, i) => s + Number(i.line_total || 0) - Number(i.discount_amount || 0), 0);
            const ratio = invAfter > 0 ? Number(h.total_amount || 0) / invAfter : 0;   // เกลี่ยส่วนลดท้ายบิล
            const lines: BreakdownLine[] = its.map(i => {
                const gross = Number(i.line_total || 0);
                const lineDisc = Number(i.discount_amount || 0);
                const net = r2((gross - lineDisc) * ratio);
                const df = i.performer_staff_id ? r2(net * Number(i.df_pct || 0) / 100) : 0;
                let refComm = 0;
                if (h.ref_staff_id && i.ref_comm_mode) {
                    const v = Number(i.ref_comm_value || 0);
                    refComm = i.ref_comm_mode === "pct" ? r2(net * v / 100) : i.ref_comm_mode === "fixed" ? v : i.ref_comm_mode === "per_unit" ? r2(v * Number(i.qty || 0)) : 0;
                }
                return {
                    name: i.item_name as string, qty: Number(i.qty || 0), gross, discount: r2(gross - net), net,
                    doctor: nm(i.performer_staff_id), df,
                    handMain: nm(i.hand_main_staff_id), handMainFee: Number(i.hand_fee_main || 0),
                    handAsst: nm(i.hand_asst_staff_id), handAsstFee: Number(i.hand_fee_asst || 0),
                    refComm, course: i.item_type === "package",
                };
            });
            const v = h.vn ? visitMap.get(h.vn as string) : null;
            out[h.id as string] = {
                invId: h.id as string, billType: (h.bill_type as string) || "normal",
                subtotal: Number(h.subtotal || 0), discount: Number(h.discount_amount || 0), total: Number(h.total_amount || 0),
                visitDoctor: nm(v?.doctor_id), visitNurse: nm(v?.nurse_id), visitAssistant: nm(v?.assistant_id),
                refStaff: nm(h.ref_staff_id), campaign: (h.campaign as string) || null,
                lines,
                totals: {
                    df: r2(lines.reduce((s, l) => s + l.df, 0)),
                    hand: r2(lines.reduce((s, l) => s + l.handMainFee + l.handAsstFee, 0)),
                    refComm: r2(lines.reduce((s, l) => s + l.refComm, 0)),
                    discount: r2(lines.reduce((s, l) => s + l.gross, 0) - Number(h.total_amount || 0)),
                },
            };
        }
    } catch { /* แสดงแบบไม่มีรายละเอียด */ }
    return out;
}
