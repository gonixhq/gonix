"use server";

import { createClient } from "@/lib/supabase/server";

// รายงานต้นทุน/มาร์จิ้นหัตถการ (เฟส 4A)
//   A) ต้นทุนมาตรฐานรายเมนู: วัสดุตามสูตร + ค่ามือ + ค่าชั่วโมงแพทย์ + DF แพทย์ % → มาร์จิ้นเทียบเกณฑ์
//   B) ต้นทุนจริงจากบิลในเดือน (snapshot cost_material / ค่ามือ / DF ที่บันทึกตอนออกบิล)

export interface StdCostRow {
    kind: "service" | "package";
    id: string;
    name: string;
    segment: string | null;
    price: number;             // ราคาขาย (คอส = ต่อครั้ง จากราคาตั้ง)
    material: number;
    hand: number;
    doctorTime: number;
    df: number;
    cost: number;
    margin: number;            // %
    missing: string[];         // ข้อมูลที่ยังไม่ได้ตั้ง
}
export interface ActualRow {
    name: string;
    qty: number;
    revenue: number;           // รายได้สุทธิหลังส่วนลด (ส่วนลดท้ายบิลเกลี่ยแล้ว)
    material: number;
    hand: number;
    df: number;
    cost: number;
    margin: number;
}
export interface ProcedureCostReport {
    month: string;
    threshold: number;
    doctorRate: number;
    dfPct: number;
    std: StdCostRow[];
    actual: ActualRow[];
    actualTotals: { revenue: number; cost: number; margin: number };
    courseUsage: { sessions: number; material: number; hand: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (price: number, cost: number) => price > 0 ? r2((price - cost) / price * 100) : 0;

export async function getProcedureCosts(month: string): Promise<ProcedureCostReport | { error: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "เดือนไม่ถูกต้อง" };
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: "Unauthorized" };
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        const clinicId = profile?.clinic_id as string;
        if (!clinicId) return { error: "ไม่พบคลินิก" };
        const [y, m] = month.split("-").map(Number);
        const first = `${month}-01`;
        const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

        const rate = async (k: string, d: number) => {
            const { data } = await supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: k, p_date: last });
            return data == null ? d : Number(data);
        };
        const [threshold, doctorRate, dfPct] = await Promise.all([rate("margin_threshold_pct", 35), rate("doctor_hour_rate", 750), rate("df_doctor_pct", 7)]);

        // ── คลัง: ต้นทุนต่อหน่วยใช้ ──
        const { data: inv } = await supabase.from("inventory").select("id, cost_price, units_per_pack, single_use").eq("clinic_id", clinicId);
        const invMap = new Map((inv || []).map(i => [i.id as string, i]));
        const useCost = (id: string | null, qty: number) => {
            const i = id ? invMap.get(id) : null;
            if (!i) return 0;
            const upp = Number(i.units_per_pack || 0);
            const q = i.single_use && upp > 0 ? Math.ceil(qty / upp) * upp : qty;
            return Number(i.cost_price || 0) * q;
        };

        // ── A) มาตรฐานรายเมนู ──
        const [{ data: svcs }, { data: recipes }, { data: pkgs }] = await Promise.all([
            supabase.from("service_catalog").select("id, service_name, item_type, selling_price, segment, inventory_item_id, consume_qty, df_nurse, df_assistant, df_mode, doctor_hours")
                .eq("clinic_id", clinicId).eq("is_active", true),
            supabase.from("service_recipes").select("service_id, inventory_item_id, qty").eq("clinic_id", clinicId),
            supabase.from("service_packages").select("id, name, price, total_sessions, segment, consume_item_id, consume_qty_per_session, material_cost_per_session, hand_fee_main, hand_fee_asst, is_bundle")
                .eq("clinic_id", clinicId).eq("is_active", true),
        ]);
        const std: StdCostRow[] = [];
        for (const s of svcs || []) {
            if (s.item_type === "doctor_fee" || s.item_type === "lab") continue;
            const price = Number(s.selling_price || 0);
            const rec = (recipes || []).filter(r => r.service_id === s.id);
            const material = (s.inventory_item_id ? useCost(s.inventory_item_id as string, Number(s.consume_qty || 1)) : 0)
                + rec.reduce((a, r) => a + useCost(r.inventory_item_id as string, Number(r.qty)), 0);
            const isPct = s.df_mode === "percent";
            const main = isPct ? price * Number(s.df_nurse || 0) / 100 : Number(s.df_nurse || 0);
            const asst = isPct ? price * Number(s.df_assistant || 0) / 100 : Number(s.df_assistant || 0);
            const hours = Number(s.doctor_hours || 0);
            const doctorTime = hours * doctorRate;
            const df = hours > 0 ? price * dfPct / 100 : 0;
            const cost = material + main + asst + doctorTime + df;
            const missing: string[] = [];
            if (!s.inventory_item_id && rec.length === 0) missing.push("สูตร");
            if (!main) missing.push("ค่ามือ");
            std.push({ kind: "service", id: s.id as string, name: s.service_name as string, segment: (s.segment as string) || null, price: r2(price),
                material: r2(material), hand: r2(main + asst), doctorTime: r2(doctorTime), df: r2(df), cost: r2(cost), margin: pct(price, cost), missing });
        }
        for (const p of pkgs || []) {
            if (p.is_bundle) continue;
            const n = Math.max(1, Number(p.total_sessions || 1));
            const price = Number(p.price || 0) / n;
            const material = Number(p.material_cost_per_session || 0) + useCost((p.consume_item_id as string) || null, Number(p.consume_qty_per_session || 0));
            const hand = Number(p.hand_fee_main || 0) + Number(p.hand_fee_asst || 0);
            const cost = material + hand;
            const missing: string[] = [];
            if (!p.material_cost_per_session && !p.consume_item_id) missing.push("ต้นทุนวัสดุ");
            if (!p.hand_fee_main) missing.push("ค่ามือ");
            std.push({ kind: "package", id: p.id as string, name: `${p.name} (ต่อครั้ง)`, segment: (p.segment as string) || null, price: r2(price),
                material: r2(material), hand: r2(hand), doctorTime: 0, df: 0, cost: r2(cost), margin: pct(price, cost), missing });
        }
        std.sort((a, b) => a.margin - b.margin);

        // ── B) จริงจากบิลเดือนนี้ ──
        const { data: heads } = await supabase.from("invoice_headers").select("id, total_amount")
            .eq("clinic_id", clinicId).gte("invoice_date", first).lte("invoice_date", last).not("status", "in", "(voided,refunded)");
        const headTotal = new Map((heads || []).map(h => [h.id as string, Number(h.total_amount || 0)]));
        const ids = [...headTotal.keys()];
        const items: Record<string, unknown>[] = [];
        for (let i = 0; i < ids.length; i += 200) {
            const { data } = await supabase.from("invoice_items")
                .select("inv_id, item_type, item_name, qty, line_total, discount_amount, cost_material, hand_fee_main, hand_fee_asst, df_pct, performer_staff_id")
                .in("inv_id", ids.slice(i, i + 200));
            items.push(...(data || []));
        }
        const invAfter = new Map<string, number>();
        items.forEach(it => { const k = it.inv_id as string; invAfter.set(k, (invAfter.get(k) || 0) + Number(it.line_total || 0) - Number(it.discount_amount || 0)); });
        const agg = new Map<string, ActualRow>();
        for (const it of items) {
            if (it.item_type === "package") continue;   // ขายคอส: รายได้/ต้นทุนเกิดตอนใช้ (ดูหน้าคอร์สค้างใช้)
            const after = Number(it.line_total || 0) - Number(it.discount_amount || 0);
            const ia = invAfter.get(it.inv_id as string) || 0;
            const revenue = ia > 0 ? after * (headTotal.get(it.inv_id as string) || 0) / ia : 0;
            const material = Number(it.cost_material || 0);
            const hand = Number(it.hand_fee_main || 0) + Number(it.hand_fee_asst || 0);
            const df = it.performer_staff_id ? revenue * Number(it.df_pct || 0) / 100 : 0;
            const name = it.item_name as string;
            const g = agg.get(name) || { name, qty: 0, revenue: 0, material: 0, hand: 0, df: 0, cost: 0, margin: 0 };
            g.qty += Number(it.qty || 0); g.revenue += revenue; g.material += material; g.hand += hand; g.df += df;
            agg.set(name, g);
        }
        const actual = [...agg.values()].map(g => {
            const cost = g.material + g.hand + g.df;
            return { ...g, revenue: r2(g.revenue), material: r2(g.material), hand: r2(g.hand), df: r2(g.df), cost: r2(cost), margin: pct(g.revenue, cost) };
        }).sort((a, b) => b.revenue - a.revenue);
        const tRev = actual.reduce((s, a) => s + a.revenue, 0), tCost = actual.reduce((s, a) => s + a.cost, 0);

        // ── การตัดคอสในเดือน (ต้นทุนที่เกิดจริง) ──
        const startISO = new Date(`${first}T00:00:00+07:00`).toISOString();
        const endISO = new Date(new Date(`${last}T00:00:00+07:00`).getTime() + 86400000).toISOString();
        const { data: uses } = await supabase.from("package_usages").select("cost_material, hand_fee_main, hand_fee_asst")
            .eq("clinic_id", clinicId).gte("used_at", startISO).lt("used_at", endISO);
        const courseUsage = {
            sessions: (uses || []).length,
            material: r2((uses || []).reduce((s, u) => s + Number(u.cost_material || 0), 0)),
            hand: r2((uses || []).reduce((s, u) => s + Number(u.hand_fee_main || 0) + Number(u.hand_fee_asst || 0), 0)),
        };

        return { month, threshold, doctorRate, dfPct, std, actual, actualTotals: { revenue: r2(tRev), cost: r2(tCost), margin: pct(tRev, tCost) }, courseUsage };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}
