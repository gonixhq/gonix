"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import type { Campaign, DiscountLineInput } from "@/lib/campaign-types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function ctx() {
    const supabase = await createClient();
    const { userId, clinicId, permissions } = await getEffectivePermissionsForUser();
    if (!userId || !clinicId) throw new Error("Unauthorized");
    return { supabase, userId, clinicId, perms: permissions };
}
type Fail = { ok: false; error: string };
type Ok<T = unknown> = { ok: true } & T;

// ════════════════ CRUD ════════════════
export async function listCampaigns(includeInactive = true): Promise<Campaign[]> {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["campaign.view"]) return [];
    let q = supabase.from("campaigns").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: false });
    if (!includeInactive) q = q.eq("is_active", true);
    const { data } = await q;
    return (data || []) as Campaign[];
}

export interface CampaignInput {
    code: string;
    name: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    max_discount_amount?: number | null;
    min_purchase?: number;
    applies_to?: string;
    channel?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    usage_limit?: number | null;
    usage_limit_per_patient?: number;
    is_active?: boolean;
}

function validateInput(input: CampaignInput): string | null {
    if (!input.code?.trim()) return "ต้องระบุโค้ด";
    if (!/^[A-Za-z0-9ก-๙_-]{2,32}$/.test(input.code.trim())) return "โค้ดใช้ได้เฉพาะตัวอักษร/ตัวเลข/ขีด ความยาว 2-32";
    if (!input.name?.trim()) return "ต้องระบุชื่อแคมเปญ";
    if (!(input.discount_value > 0)) return "ส่วนลดต้องมากกว่า 0";
    if (input.discount_type === "percent" && input.discount_value > 100) return "เปอร์เซ็นต์ต้องไม่เกิน 100";
    if (input.starts_at && input.ends_at && input.starts_at > input.ends_at) return "วันเริ่มต้องไม่เกินวันสิ้นสุด";
    return null;
}

export async function createCampaign(input: CampaignInput): Promise<Ok<{ id: string }> | Fail> {
    const { supabase, clinicId, userId, perms } = await ctx();
    if (!perms["campaign.manage"]) return { ok: false, error: "ไม่มีสิทธิ์จัดการแคมเปญ" };
    const bad = validateInput(input);
    if (bad) return { ok: false, error: bad };

    const { data, error } = await supabase.from("campaigns").insert({
        clinic_id: clinicId,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        discount_type: input.discount_type,
        discount_value: input.discount_value,
        max_discount_amount: input.max_discount_amount ?? null,
        min_purchase: input.min_purchase ?? 0,
        applies_to: input.applies_to || "all",
        channel: input.channel || null,
        starts_at: input.starts_at || null,
        ends_at: input.ends_at || null,
        usage_limit: input.usage_limit ?? null,
        usage_limit_per_patient: input.usage_limit_per_patient ?? 1,
        is_active: input.is_active ?? true,
        created_by: userId,
    }).select("id").single();

    if (error) {
        if (error.code === "23505") return { ok: false, error: "โค้ดนี้มีอยู่แล้ว" };
        return { ok: false, error: error.message };
    }
    revalidatePath("/dashboard/campaigns");
    return { ok: true, id: data.id as string };
}

export async function updateCampaign(id: string, input: CampaignInput): Promise<Ok | Fail> {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["campaign.manage"]) return { ok: false, error: "ไม่มีสิทธิ์จัดการแคมเปญ" };
    const bad = validateInput(input);
    if (bad) return { ok: false, error: bad };

    const { error } = await supabase.from("campaigns").update({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        discount_type: input.discount_type,
        discount_value: input.discount_value,
        max_discount_amount: input.max_discount_amount ?? null,
        min_purchase: input.min_purchase ?? 0,
        applies_to: input.applies_to || "all",
        channel: input.channel || null,
        starts_at: input.starts_at || null,
        ends_at: input.ends_at || null,
        usage_limit: input.usage_limit ?? null,
        usage_limit_per_patient: input.usage_limit_per_patient ?? 1,
        is_active: input.is_active ?? true,
    }).eq("id", id).eq("clinic_id", clinicId);

    if (error) {
        if (error.code === "23505") return { ok: false, error: "โค้ดนี้มีอยู่แล้ว" };
        return { ok: false, error: error.message };
    }
    revalidatePath("/dashboard/campaigns");
    return { ok: true };
}

export async function toggleCampaign(id: string, active: boolean): Promise<Ok | Fail> {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["campaign.manage"]) return { ok: false, error: "ไม่มีสิทธิ์จัดการแคมเปญ" };
    const { error } = await supabase.from("campaigns").update({ is_active: active }).eq("id", id).eq("clinic_id", clinicId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/campaigns");
    return { ok: true };
}

/** ลบได้เฉพาะแคมเปญที่ยังไม่เคยถูกใช้ — ที่ใช้แล้วให้ปิดแทน (รักษาประวัติบิล) */
export async function deleteCampaign(id: string): Promise<Ok | Fail> {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["campaign.manage"]) return { ok: false, error: "ไม่มีสิทธิ์จัดการแคมเปญ" };
    const { count } = await supabase.from("invoice_discounts")
        .select("id", { count: "exact", head: true }).eq("campaign_id", id);
    if ((count || 0) > 0) return { ok: false, error: "แคมเปญนี้ถูกใช้ไปแล้ว — ปิดใช้งานแทนการลบ (เก็บประวัติบิล)" };
    const { error } = await supabase.from("campaigns").delete().eq("id", id).eq("clinic_id", clinicId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/campaigns");
    return { ok: true };
}

// ════════════════ ตรวจโค้ด + คำนวณส่วนลด (ใช้ตอนคิดเงิน) ════════════════
export interface ValidatedCampaign {
    campaign_id: string;
    code: string;
    name: string;
    discount_amount: number;
    eligible_base: number;      // ยอดที่โค้ดนี้ใช้ได้ (หลังกรอง applies_to)
    channel: string | null;
}

/**
 * ตรวจเงื่อนไขโค้ดทั้งหมดฝั่ง server แล้วคืนยอดส่วนลดที่คำนวณให้
 * เช็ค: มีอยู่/เปิดใช้ · ช่วงวันที่ · ยอดขั้นต่ำ · applies_to · เพดาน ·
 *       จำนวนครั้งรวม · จำนวนครั้งต่อคนไข้
 * หมายเหตุ: การนับ usage อ่านจาก invoice_discounts (บิลที่ออกแล้วเท่านั้น)
 *           ไม่ได้ล็อกแบบ atomic — โอกาสชนกันจริงต่ำมากในคลินิกเดียว
 */
export async function validateCampaignCode(input: {
    code: string; hn?: string | null; items: DiscountLineInput[];
}): Promise<Ok<ValidatedCampaign> | Fail> {
    const { supabase, clinicId } = await ctx();
    const code = (input.code || "").trim().toUpperCase();
    if (!code) return { ok: false, error: "กรอกโค้ดก่อน" };

    const { data: c } = await supabase.from("campaigns")
        .select("*").eq("clinic_id", clinicId).ilike("code", code).maybeSingle();
    if (!c) return { ok: false, error: "ไม่พบโค้ดนี้" };
    if (!c.is_active) return { ok: false, error: `โค้ด ${code} ถูกปิดใช้งาน` };

    const today = bangkokDate();
    if (c.starts_at && today < c.starts_at) return { ok: false, error: `โค้ดนี้เริ่มใช้ได้ ${c.starts_at}` };
    if (c.ends_at && today > c.ends_at) return { ok: false, error: `โค้ดนี้หมดอายุแล้ว (${c.ends_at})` };

    // ฐานที่ใช้ลดได้ตาม applies_to
    const items = input.items || [];
    const eligible = c.applies_to === "all"
        ? items
        : items.filter(i => i.item_type === c.applies_to);
    const eligibleBase = eligible.reduce((s, i) => s + Number(i.line_total || 0), 0);
    if (eligibleBase <= 0) {
        return { ok: false, error: `โค้ดนี้ใช้ได้กับ${c.applies_to === "all" ? "บิลนี้ไม่ได้" : "เฉพาะบางรายการ — ไม่มีรายการที่เข้าเงื่อนไขในบิล"}` };
    }

    const billTotal = items.reduce((s, i) => s + Number(i.line_total || 0), 0);
    if (Number(c.min_purchase || 0) > 0 && billTotal < Number(c.min_purchase)) {
        return { ok: false, error: `ยอดขั้นต่ำ ฿${Number(c.min_purchase).toLocaleString()} ถึงใช้โค้ดนี้ได้` };
    }

    // จำนวนครั้งที่ใช้ไปแล้ว (ทั้งแคมเปญ)
    if (c.usage_limit != null) {
        const { count } = await supabase.from("invoice_discounts")
            .select("id", { count: "exact", head: true }).eq("campaign_id", c.id);
        if ((count || 0) >= Number(c.usage_limit)) {
            return { ok: false, error: "โค้ดนี้ถูกใช้ครบจำนวนแล้ว" };
        }
    }

    // จำกัดต่อคนไข้
    if (input.hn) {
        const { data: used } = await supabase.from("invoice_discounts")
            .select("inv_id, invoice_headers!inner(hn, status)")
            .eq("campaign_id", c.id)
            .eq("invoice_headers.hn", input.hn);
        const validUses = (used || []).filter((u: any) => {
            const h = Array.isArray(u.invoice_headers) ? u.invoice_headers[0] : u.invoice_headers;
            return h && !["voided", "refunded"].includes(h.status);
        }).length;
        if (validUses >= Number(c.usage_limit_per_patient || 1)) {
            return { ok: false, error: `คนไข้รายนี้ใช้โค้ดนี้ครบ ${c.usage_limit_per_patient} ครั้งแล้ว` };
        }
    }

    // คำนวณส่วนลด
    let amount = c.discount_type === "percent"
        ? eligibleBase * Number(c.discount_value) / 100
        : Number(c.discount_value);
    if (c.max_discount_amount != null) amount = Math.min(amount, Number(c.max_discount_amount));
    amount = Math.min(amount, eligibleBase);          // ลดเกินยอดไม่ได้
    amount = Math.round(amount * 100) / 100;

    return {
        ok: true, campaign_id: c.id as string, code: c.code as string, name: c.name as string,
        discount_amount: amount, eligible_base: Math.round(eligibleBase * 100) / 100,
        channel: (c.channel as string) || null,
    };
}

// ════════════════ รายงาน ════════════════
export interface CampaignPerf {
    campaign_id: string; code: string; name: string; channel: string | null;
    invoice_count: number; unique_patients: number;
    discount_total: number; gross_before_discount: number; net_revenue: number;
    first_used: string | null; last_used: string | null;
}

export async function getCampaignPerformance(from?: string, to?: string): Promise<CampaignPerf[]> {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["campaign.view"]) return [];

    // ช่วงวันที่ต้องคำนวณเอง (view รวมทุกช่วง) — query ตรงจาก invoice_discounts
    const { data: campaigns } = await supabase.from("campaigns")
        .select("id, code, name, channel").eq("clinic_id", clinicId);
    if (!campaigns?.length) return [];

    let q = supabase.from("invoice_discounts")
        .select("campaign_id, amount, inv_id, invoice_headers!inner(hn, status, subtotal, paid_amount, invoice_date)")
        .eq("clinic_id", clinicId).not("campaign_id", "is", null);
    if (from) q = q.gte("invoice_headers.invoice_date", from);
    if (to) q = q.lte("invoice_headers.invoice_date", to);
    const { data: rows } = await q;

    const agg = new Map<string, {
        discount: number; invoices: Set<string>; patients: Set<string>;
        gross: Map<string, number>; net: Map<string, number>; dates: string[];
    }>();
    for (const r of (rows || []) as any[]) {
        const h = Array.isArray(r.invoice_headers) ? r.invoice_headers[0] : r.invoice_headers;
        if (!h || ["voided", "refunded"].includes(h.status)) continue;
        const key = r.campaign_id as string;
        if (!agg.has(key)) agg.set(key, { discount: 0, invoices: new Set(), patients: new Set(), gross: new Map(), net: new Map(), dates: [] });
        const a = agg.get(key)!;
        a.discount += Number(r.amount || 0);
        a.invoices.add(r.inv_id);
        if (h.hn) a.patients.add(h.hn);
        a.gross.set(r.inv_id, Number(h.subtotal || 0));   // Map กันนับซ้ำเมื่อบิลเดียวมีหลายส่วนลด
        a.net.set(r.inv_id, Number(h.paid_amount || 0));
        if (h.invoice_date) a.dates.push(h.invoice_date);
    }

    const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
    return (campaigns as any[]).map(c => {
        const a = agg.get(c.id);
        const dates = (a?.dates || []).sort();
        return {
            campaign_id: c.id, code: c.code, name: c.name, channel: c.channel,
            invoice_count: a?.invoices.size || 0,
            unique_patients: a?.patients.size || 0,
            discount_total: Math.round((a?.discount || 0) * 100) / 100,
            gross_before_discount: Math.round(sum(a?.gross || new Map()) * 100) / 100,
            net_revenue: Math.round(sum(a?.net || new Map()) * 100) / 100,
            first_used: dates[0] || null,
            last_used: dates[dates.length - 1] || null,
        };
    }).sort((x, y) => y.discount_total - x.discount_total);
}

export interface DiscountDaySummary {
    total: number;
    byType: { type: string; amount: number; count: number }[];
    revenue: number;
    pctOfRevenue: number;
    topStaff: { name: string; amount: number; count: number }[];
}

/**
 * สรุปส่วนลดของวัน (ใช้ในหน้าปิดยอด) + ยอดส่วนลดรายพนักงาน
 *
 * ⚠️ ยึด invoice_headers.discount_amount เป็น "ยอดจริง" (source of truth ของเงินที่ลดไปจริง)
 * แล้วใช้ invoice_discounts มาแยกประเภท/รายพนักงาน — ส่วนที่ breakdown ไม่ครบ
 * (บิลเก่าก่อนระบบ breakdown / ลดโดยไม่ได้ระบุที่มา) จะโผล่เป็น "ไม่ระบุที่มา"
 * เพื่อให้ยอดรวมตรงกับหัวบิลเสมอ ไม่ตกหล่น
 */
export async function getDiscountSummary(date?: string): Promise<DiscountDaySummary> {
    const { supabase, clinicId, perms } = await ctx();
    const empty: DiscountDaySummary = { total: 0, byType: [], revenue: 0, pctOfRevenue: 0, topStaff: [] };
    if (!perms["finance.view"]) return empty;
    const day = date || bangkokDate();

    // บิลของวัน (ตัด voided/refunded) — ยอดลดในหัวบิล = ยอดจริง
    const { data: invs } = await supabase.from("invoice_headers")
        .select("id, status, discount_amount, paid_amount").eq("clinic_id", clinicId).eq("invoice_date", day);
    const validInvs = ((invs || []) as any[]).filter(i => !["voided", "refunded"].includes(i.status));
    const headerDiscById = new Map<string, number>(
        validInvs.map(i => [i.id as string, Number(i.discount_amount || 0)])
    );
    const revenue = validInvs.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    const total = [...headerDiscById.values()].reduce((s, v) => s + v, 0);

    // breakdown เฉพาะบิลที่ valid ในวันนั้น
    const discountedIds = [...headerDiscById.entries()].filter(([, v]) => v > 0).map(([id]) => id);
    const byTypeMap = new Map<string, { amount: number; count: number }>();
    const byStaff = new Map<string, { amount: number; count: number }>();
    const breakdownSumByInv = new Map<string, number>();

    if (discountedIds.length > 0) {
        const { data: rows } = await supabase.from("invoice_discounts")
            .select("inv_id, amount, discount_type, created_by")
            .eq("clinic_id", clinicId).in("inv_id", discountedIds);
        for (const r of (rows || []) as any[]) {
            const amt = Number(r.amount || 0);
            const t = byTypeMap.get(r.discount_type) || { amount: 0, count: 0 };
            byTypeMap.set(r.discount_type, { amount: t.amount + amt, count: t.count + 1 });
            breakdownSumByInv.set(r.inv_id, (breakdownSumByInv.get(r.inv_id) || 0) + amt);
            if (r.created_by) {
                const s = byStaff.get(r.created_by) || { amount: 0, count: 0 };
                byStaff.set(r.created_by, { amount: s.amount + amt, count: s.count + 1 });
            }
        }
    }

    // เติมส่วนที่ breakdown ไม่ครบ → "ไม่ระบุที่มา" (ให้ยอดรวมตรงกับหัวบิล)
    let unclassified = 0, unclassifiedCount = 0;
    for (const id of discountedIds) {
        const gap = (headerDiscById.get(id) || 0) - (breakdownSumByInv.get(id) || 0);
        if (gap > 0.01) { unclassified += gap; unclassifiedCount++; }
    }
    if (unclassified > 0.01) {
        byTypeMap.set("unclassified", { amount: unclassified, count: unclassifiedCount });
    }

    // ชื่อพนักงาน
    let topStaff: { name: string; amount: number; count: number }[] = [];
    if (byStaff.size > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", [...byStaff.keys()]);
        const nameOf = new Map(((profs || []) as any[]).map(p => [p.id, p.full_name || "—"]));
        topStaff = [...byStaff.entries()]
            .map(([id, v]) => ({ name: nameOf.get(id) || "—", amount: Math.round(v.amount * 100) / 100, count: v.count }))
            .sort((a, b) => b.amount - a.amount).slice(0, 5);
    }

    return {
        total: Math.round(total * 100) / 100,
        byType: [...byTypeMap.entries()].map(([type, v]) => ({ type, amount: Math.round(v.amount * 100) / 100, count: v.count }))
            .sort((a, b) => b.amount - a.amount),
        revenue: Math.round(revenue * 100) / 100,
        pctOfRevenue: revenue > 0 ? Math.round(total / revenue * 1000) / 10 : 0,
        topStaff,
    };
}

/** ส่วนลดของบิลหนึ่งใบ (ใช้ในใบเสร็จ + หน้ารายละเอียด) */
export async function getInvoiceDiscounts(invId: string) {
    const { supabase, clinicId } = await ctx();
    const { data } = await supabase.from("invoice_discounts")
        .select("id, inv_item_id, discount_type, discount_source, amount, campaign_id, campaigns(code, name)")
        .eq("clinic_id", clinicId).eq("inv_id", invId).order("created_at");
    return data || [];
}
