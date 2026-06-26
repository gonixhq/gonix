"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const round2 = (n: number) => Math.round(n * 100) / 100;
const WHT_RATE = 0.03;

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

export interface Affiliate {
    id: string;
    name: string;
    phone: string | null;
    bank_account: string | null;
    bank_name: string | null;
    referral_code: string;
    commission_type: "recurring" | "one_time";
    commission_pct: number;
    attribution_months: number;
    is_active: boolean;
    note: string | null;
}

export interface AffiliateEntry {
    inv_id: string;
    hn: string;
    patient_name: string;
    invoice_date: string;
    sale_amount: number;
    pct: number;
    commission: number;
}

export interface AffiliateSummary {
    affiliate: Affiliate;
    patient_count: number;
    period_commission: number;
    is_paid: boolean;
    paid_net?: number | null;
}

/** รายชื่อ affiliate ทั้งหมด */
export async function listAffiliates(): Promise<Affiliate[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase
            .from("affiliates").select("*").eq("clinic_id", clinicId)
            .order("is_active", { ascending: false }).order("name");
        return (data || []) as Affiliate[];
    } catch {
        return [];
    }
}

export async function createAffiliate(input: {
    name: string; phone?: string; bank_account?: string; bank_name?: string;
    referral_code: string; commission_type: "recurring" | "one_time";
    commission_pct: number; attribution_months?: number; note?: string;
}) {
    try {
        const { supabase, userId, clinicId } = await ctx();
        const code = input.referral_code.trim().toUpperCase();
        if (!input.name.trim() || !code) return { success: false, error: "กรอกชื่อ + รหัสแนะนำ" };
        if (input.commission_pct < 0 || input.commission_pct > 100) return { success: false, error: "% ต้องอยู่ 0–100" };
        const { error } = await supabase.from("affiliates").insert({
            clinic_id: clinicId, name: input.name.trim(), phone: input.phone || null,
            bank_account: input.bank_account || null, bank_name: input.bank_name || null,
            referral_code: code, commission_type: input.commission_type,
            commission_pct: input.commission_pct, attribution_months: input.attribution_months ?? 6,
            note: input.note || null, created_by: userId,
        });
        if (error) return { success: false, error: error.message.includes("duplicate") ? "รหัสแนะนำซ้ำ" : error.message };
        revalidatePath("/dashboard/affiliates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

export async function updateAffiliate(id: string, patch: Partial<{
    name: string; phone: string; bank_account: string; bank_name: string;
    commission_type: "recurring" | "one_time"; commission_pct: number; attribution_months: number; is_active: boolean; note: string;
}>) {
    try {
        const { supabase, clinicId } = await ctx();
        const { error } = await supabase.from("affiliates").update(patch).eq("id", id).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/affiliates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** หา affiliate จากรหัสแนะนำ (ใช้ตอนลงทะเบียนผู้ป่วย) */
export async function lookupAffiliateByCode(code: string): Promise<{ id: string; name: string } | null> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("affiliates")
            .select("id, name").eq("clinic_id", clinicId).eq("is_active", true)
            .eq("referral_code", code.trim().toUpperCase()).maybeSingle();
        return data ? { id: data.id as string, name: data.name as string } : null;
    } catch {
        return null;
    }
}

/** คำนวณ commission entries ของ affiliate ในเดือน */
export async function getAffiliateLedger(affiliateId: string, periodMonth: string): Promise<{ entries: AffiliateEntry[]; total: number; affiliate: Affiliate | null }> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data: aff } = await supabase.from("affiliates").select("*").eq("id", affiliateId).eq("clinic_id", clinicId).maybeSingle();
        if (!aff) return { entries: [], total: 0, affiliate: null };
        const affiliate = aff as Affiliate;

        const { data: pats } = await supabase.from("patients")
            .select("hn, first_name, last_name, affiliate_attributed_at")
            .eq("clinic_id", clinicId).eq("affiliate_id", affiliateId);
        const patList = pats || [];
        if (patList.length === 0) return { entries: [], total: 0, affiliate };
        const hns = patList.map(p => p.hn as string);
        const patByHn: Record<string, { name: string; attr: string | null }> = {};
        patList.forEach(p => { patByHn[p.hn as string] = { name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || (p.hn as string), attr: (p.affiliate_attributed_at as string) || null }; });

        const { data: invs } = await supabase.from("invoice_headers")
            .select("id, hn, invoice_date, paid_amount, total_amount, status")
            .in("hn", hns).eq("status", "paid").order("invoice_date", { ascending: true });
        const invList = invs || [];

        // หาใบแรกของแต่ละ hn (สำหรับ one_time)
        const firstByHn: Record<string, string> = {};
        invList.forEach(i => { if (!firstByHn[i.hn as string]) firstByHn[i.hn as string] = i.id as string; });

        const pct = Number(affiliate.commission_pct);
        const out: AffiliateEntry[] = [];
        for (const inv of invList) {
            const date = inv.invoice_date as string;
            if (!date || !date.startsWith(periodMonth)) continue; // เฉพาะเดือนนี้
            const hn = inv.hn as string;
            let qualifies = false;
            if (affiliate.commission_type === "one_time") {
                qualifies = firstByHn[hn] === inv.id;
            } else {
                const attr = patByHn[hn]?.attr;
                if (attr) {
                    const end = new Date(attr + "T00:00:00");
                    end.setMonth(end.getMonth() + Number(affiliate.attribution_months || 6));
                    qualifies = new Date(date + "T00:00:00") <= end;
                } else qualifies = true;
            }
            if (!qualifies) continue;
            const sale = Number(inv.paid_amount ?? inv.total_amount ?? 0);
            out.push({
                inv_id: inv.id as string, hn, patient_name: patByHn[hn]?.name || hn,
                invoice_date: date, sale_amount: sale, pct, commission: round2(sale * pct / 100),
            });
        }
        const total = round2(out.reduce((s, e) => s + e.commission, 0));
        return { entries: out, total, affiliate };
    } catch {
        return { entries: [], total: 0, affiliate: null };
    }
}

/** สรุปทุก affiliate ในเดือน + สถานะจ่าย */
export async function getAffiliatesSummary(periodMonth: string): Promise<AffiliateSummary[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const affs = await listAffiliates();
        if (affs.length === 0) return [];

        const { data: payouts } = await supabase.from("affiliate_payouts")
            .select("affiliate_id, net_amount").eq("clinic_id", clinicId).eq("period_month", periodMonth);
        const paidMap: Record<string, number> = {};
        (payouts || []).forEach(p => { paidMap[p.affiliate_id as string] = Number(p.net_amount); });

        const out: AffiliateSummary[] = [];
        for (const a of affs) {
            const { count } = await supabase.from("patients")
                .select("hn", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("affiliate_id", a.id);
            const ledger = await getAffiliateLedger(a.id, periodMonth);
            out.push({
                affiliate: a,
                patient_count: count ?? 0,
                period_commission: ledger.total,
                is_paid: a.id in paidMap,
                paid_net: paidMap[a.id] ?? null,
            });
        }
        return out;
    } catch {
        return [];
    }
}

/** บันทึกจ่ายเงิน affiliate (หัก 3% ณ ที่จ่าย) */
export async function recordAffiliatePayout(affiliateId: string, periodMonth: string, opts?: { note?: string }) {
    try {
        const { supabase, userId, clinicId } = await ctx();
        const ledger = await getAffiliateLedger(affiliateId, periodMonth);
        const gross = ledger.total;
        if (gross <= 0) return { success: false, error: "ไม่มียอดให้จ่าย" };
        const wht = round2(gross * WHT_RATE);
        const net = round2(gross - wht);
        const { error } = await supabase.from("affiliate_payouts").upsert({
            clinic_id: clinicId, affiliate_id: affiliateId, period_month: periodMonth,
            gross_amount: gross, wht_amount: wht, net_amount: net,
            paid_by: userId, note: opts?.note || null, paid_at: new Date().toISOString(),
        }, { onConflict: "clinic_id,affiliate_id,period_month" });
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/affiliates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ยกเลิกการจ่าย */
export async function deleteAffiliatePayout(affiliateId: string, periodMonth: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { error } = await supabase.from("affiliate_payouts").delete()
            .eq("clinic_id", clinicId).eq("affiliate_id", affiliateId).eq("period_month", periodMonth);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/affiliates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
