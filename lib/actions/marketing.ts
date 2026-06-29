"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/permissions";
import { AD_CHANNELS, CHANNEL_LABEL, type AdChannel, type AdSpendRow, type CacRow } from "@/lib/marketing-constants";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/** เหมือน ctx() แต่เช็คสิทธิ์ finance.commission ก่อน (กรอกค่าโฆษณา CAC) */
async function ctxManage() {
    const c = await ctx();
    if (!(await can("finance.commission"))) throw new Error("คุณไม่มีสิทธิ์จัดการค่าคอม/เซลล์ (ต้องการสิทธิ์ finance.commission)");
    return c;
}

/** อ่านค่าโฆษณาที่กรอกไว้ของเดือน */
export async function listAdSpend(periodMonth: string): Promise<AdSpendRow[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("marketing_ad_spend")
            .select("channel, amount, new_customers, note")
            .eq("clinic_id", clinicId).eq("period_month", periodMonth);
        return (data || []).map(r => ({ channel: r.channel as string, amount: Number(r.amount), new_customers: Number(r.new_customers), note: (r.note as string) || null }));
    } catch {
        return [];
    }
}

/** บันทึก/แก้ค่าโฆษณาต่อช่องทาง (upsert) */
export async function upsertAdSpend(periodMonth: string, channel: string, amount: number, newCustomers: number, note?: string) {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        if (!AD_CHANNELS.includes(channel as AdChannel)) return { success: false, error: "ช่องทางไม่ถูกต้อง" };
        if (amount < 0 || newCustomers < 0) return { success: false, error: "ค่าต้องไม่ติดลบ" };
        const { error } = await supabase.from("marketing_ad_spend").upsert({
            clinic_id: clinicId, period_month: periodMonth, channel,
            amount, new_customers: Math.floor(newCustomers), note: note || null,
            created_by: userId, updated_at: new Date().toISOString(),
        }, { onConflict: "clinic_id,period_month,channel" });
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/affiliates/cac");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** รายงาน CAC: ช่องโฆษณา (กรอกมือ) + ช่องเซลล์ (auto จากค่าคอม + ลูกค้าใหม่) */
export async function getCacReport(periodMonth: string): Promise<{ rows: CacRow[]; totalSpend: number; totalNew: number }> {
    try {
        const { supabase, clinicId } = await ctx();

        // ── ช่องโฆษณา (กรอกมือ) ──
        const ad = await listAdSpend(periodMonth);
        const rows: CacRow[] = ad.map(r => ({
            channel: r.channel, label: CHANNEL_LABEL[r.channel] || r.channel,
            spend: r.amount, new_customers: r.new_customers,
            cac: r.new_customers > 0 ? round2(r.amount / r.new_customers) : null, is_auto: false,
        }));

        // ── ช่องเซลล์ (auto) ──
        // ต้นทุน = ค่าคอม gross ที่จ่าย/ปิดยอดในเดือนนี้
        const { data: payouts } = await supabase.from("affiliate_payouts")
            .select("gross_amount").eq("clinic_id", clinicId).eq("period_month", periodMonth);
        const sellerSpend = round2((payouts || []).reduce((s, p) => s + Number(p.gross_amount), 0));
        // ลูกค้าใหม่จากเซลล์ = ผู้ป่วยที่ถูก attribute ในเดือนนี้
        // (affiliate_attributed_at เป็น date — ใช้ขอบบน = วันแรกของเดือนถัดไป กันบั๊กเดือนไม่มีวันที่ 31)
        const [yy, mm] = periodMonth.split("-").map(Number);
        const nextMonthStart = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
        const { count: sellerNew } = await supabase.from("patients")
            .select("hn", { count: "exact", head: true })
            .eq("clinic_id", clinicId).not("affiliate_id", "is", null)
            .gte("affiliate_attributed_at", `${periodMonth}-01`).lt("affiliate_attributed_at", nextMonthStart);
        const sellerCount = sellerNew ?? 0;
        rows.push({
            channel: "affiliate", label: CHANNEL_LABEL.affiliate,
            spend: sellerSpend, new_customers: sellerCount,
            cac: sellerCount > 0 ? round2(sellerSpend / sellerCount) : null, is_auto: true,
        });

        const totalSpend = round2(rows.reduce((s, r) => s + r.spend, 0));
        const totalNew = rows.reduce((s, r) => s + r.new_customers, 0);
        return { rows, totalSpend, totalNew };
    } catch {
        return { rows: [], totalSpend: 0, totalNew: 0 };
    }
}
