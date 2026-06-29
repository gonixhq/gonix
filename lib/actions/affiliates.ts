"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { pushLineText } from "@/lib/line";
import { can } from "@/lib/auth/permissions";

const MANAGE_KEY = "finance.commission";

const round2 = (n: number) => Math.round(n * 100) / 100;
const WHT_RATE = 0.03;

/** เลือก % ตามขั้น: ขั้นที่ from_n มากสุดที่ <= index; ไม่เข้าขั้นใดเลย → flatPct */
function pctForIndex(tiers: RateTier[], index: number, flatPct: number): number {
    let chosen = flatPct, bestFrom = -1;
    for (const t of tiers) {
        if (t.from_n <= index && t.from_n > bestFrom) { bestFrom = t.from_n; chosen = Number(t.pct); }
    }
    return chosen;
}

/** จำนวนเดือนเต็มระหว่าง 2 วันที่ (month_seq index = diff + 1) */
function monthsBetween(fromISO: string, toISO: string): number {
    const a = new Date(fromISO + "T00:00:00"), b = new Date(toISO + "T00:00:00");
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/** เหมือน ctx() แต่เช็คสิทธิ์ finance.commission ก่อน — ใช้กับ action ที่เขียนข้อมูล
 *  (จ่าย/ปิดยอด/โอนสิทธิ์/แก้เรท/แบ่งบิล/สร้าง-แก้เซลล์) · throw ถ้าไม่มีสิทธิ์ → catch คืน error */
async function ctxManage() {
    const c = await ctx();
    if (!(await can(MANAGE_KEY))) throw new Error("คุณไม่มีสิทธิ์จัดการค่าคอม/เซลล์ (ต้องการสิทธิ์ finance.commission)");
    return c;
}

export type RateBasis = "flat" | "bill_seq" | "month_seq";

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
    rate_basis: RateBasis;
    id_card_path: string | null;
    bank_book_path: string | null;
    line_user_id: string | null;
    branch_id: string | null;
    is_active: boolean;
    note: string | null;
}

export interface BranchOption { id: string; name: string; }

/** รายชื่อสาขา (สำหรับ branch picker — M17) */
export async function getBranches(): Promise<BranchOption[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("branches")
            .select("id, branch_name").eq("clinic_id", clinicId).eq("is_active", true)
            .order("sort_order", { ascending: true });
        return (data || []).map(b => ({ id: b.id as string, name: (b.branch_name as string) || "—" }));
    } catch {
        return [];
    }
}

export interface RateTier {
    from_n: number;   // ใช้ตั้งแต่บิ/เดือนที่ N เป็นต้นไป (1-based)
    pct: number;
}

export interface RateSchedule {
    basis: RateBasis;
    flat_pct: number;       // ใช้เมื่อ basis='flat' หรือ index หลุดทุกขั้น
    tiers: RateTier[];      // เรียง from_n น้อย→มาก
}

export interface RateAuditEntry {
    id: string;
    actor_name: string | null;
    old_value: RateSchedule | null;
    new_value: RateSchedule | null;
    note: string | null;
    created_at: string;
}

export interface AffiliateEntry {
    inv_id: string;
    hn: string;
    patient_name: string;
    invoice_date: string;
    sale_amount: number;
    pct: number;
    commission: number;
    is_split?: boolean;   // ค่าคอมจากการแบ่งบิล (M14) ไม่ใช่ attribution ปกติ
}

export type PayoutStatus = "none" | "closed" | "paid";

export interface AffiliateSummary {
    affiliate: Affiliate;
    patient_count: number;
    period_commission: number;   // ยอด snapshot ถ้าปิด/จ่ายแล้ว มิฉะนั้นยอดสด
    is_paid: boolean;
    payout_status: PayoutStatus;
    paid_net?: number | null;
}

export interface PayoutHistoryRow {
    affiliate_id: string;
    affiliate_name: string;
    period_month: string;
    gross_amount: number;
    wht_amount: number;
    net_amount: number;
    status: string;
    paid_at: string | null;
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
    commission_pct: number; attribution_months?: number; note?: string; branch_id?: string | null;
}) {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        const code = input.referral_code.trim().toUpperCase();
        if (!input.name.trim() || !code) return { success: false, error: "กรอกชื่อ + รหัสแนะนำ" };
        if (input.commission_pct < 0 || input.commission_pct > 100) return { success: false, error: "% ต้องอยู่ 0–100" };
        const { error } = await supabase.from("affiliates").insert({
            clinic_id: clinicId, name: input.name.trim(), phone: input.phone || null,
            bank_account: input.bank_account || null, bank_name: input.bank_name || null,
            referral_code: code, commission_type: input.commission_type,
            commission_pct: input.commission_pct, attribution_months: input.attribution_months ?? 6,
            note: input.note || null, branch_id: input.branch_id || null, created_by: userId,
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
    commission_type: "recurring" | "one_time"; commission_pct: number; attribution_months: number; is_active: boolean; note: string; branch_id: string | null;
}>) {
    try {
        const { supabase, clinicId } = await ctxManage();
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

        // ── ผู้ป่วยที่ฉันเป็นเซลล์คนแรก (primary attribution) ──
        const { data: pats } = await supabase.from("patients")
            .select("hn, first_name, last_name, affiliate_attributed_at")
            .eq("clinic_id", clinicId).eq("affiliate_id", affiliateId);
        const patList = pats || [];
        const hns = patList.map(p => p.hn as string);
        const patByHn: Record<string, { name: string; attr: string | null }> = {};
        patList.forEach(p => { patByHn[p.hn as string] = { name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || (p.hn as string), attr: (p.affiliate_attributed_at as string) || null }; });

        const { data: invs } = hns.length ? await supabase.from("invoice_headers")
            .select("id, hn, invoice_date, paid_amount, total_amount, status")
            .in("hn", hns).eq("status", "paid").order("invoice_date", { ascending: true }) : { data: [] };
        const invList = invs || [];
        const primaryInvIds = invList.map(i => i.id as string);

        // ── M14 splits: บิลที่ฉันมีส่วนแบ่ง + บิล primary ที่ถูก override ──
        const { data: mySplitRows } = await supabase.from("affiliate_invoice_splits")
            .select("inv_id, pct").eq("clinic_id", clinicId).eq("affiliate_id", affiliateId);
        const myPctByInv: Record<string, number> = {};
        (mySplitRows || []).forEach(r => { myPctByInv[r.inv_id as string] = Number(r.pct); });
        const { data: overrideRows } = primaryInvIds.length ? await supabase.from("affiliate_invoice_splits")
            .select("inv_id").eq("clinic_id", clinicId).in("inv_id", primaryInvIds) : { data: [] };
        const overriddenSet = new Set((overrideRows || []).map(r => r.inv_id as string));

        // หาใบแรกของแต่ละ hn (สำหรับ one_time)
        const firstByHn: Record<string, string> = {};
        invList.forEach(i => { if (!firstByHn[i.hn as string]) firstByHn[i.hn as string] = i.id as string; });

        // โหลดขั้นค่าคอม (ถ้ามี) — ใช้เมื่อ rate_basis <> 'flat'
        const flatPct = Number(affiliate.commission_pct);
        const basis = (affiliate.rate_basis || "flat") as RateBasis;
        const { data: tierRows } = basis === "flat" ? { data: [] } : await supabase
            .from("affiliate_rate_tiers").select("from_n, pct")
            .eq("affiliate_id", affiliateId).eq("clinic_id", clinicId).order("from_n");
        const tiers: RateTier[] = (tierRows || []).map(t => ({ from_n: Number(t.from_n), pct: Number(t.pct) }));

        const seqByHn: Record<string, number> = {};   // ลำดับบิลของแต่ละ hn (นับทุกบิล)
        const out: AffiliateEntry[] = [];
        for (const inv of invList) {
            const date = inv.invoice_date as string;
            const hn = inv.hn as string;
            // นับลำดับบิลก่อน filter เดือน เพื่อให้ bill_seq ถูกต้องข้ามเดือน
            seqByHn[hn] = (seqByHn[hn] || 0) + 1;
            const billSeq = seqByHn[hn];
            if (!date || !date.startsWith(periodMonth)) continue; // เฉพาะเดือนนี้
            const sale = Number(inv.paid_amount ?? inv.total_amount ?? 0);

            // บิลที่ถูกแบ่ง (override) → คิดตาม split pct ข้ามเงื่อนไข attribution ปกติ
            if (overriddenSet.has(inv.id as string)) {
                const sp = myPctByInv[inv.id as string];
                if (sp === undefined) continue;   // ฉันไม่ได้อยู่ในส่วนแบ่งบิลนี้
                out.push({
                    inv_id: inv.id as string, hn, patient_name: patByHn[hn]?.name || hn,
                    invoice_date: date, sale_amount: sale, pct: sp, commission: round2(sale * sp / 100), is_split: true,
                });
                continue;
            }

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
            // เลือก % ตามขั้น
            let pct = flatPct;
            if (basis === "bill_seq" && tiers.length) {
                pct = pctForIndex(tiers, billSeq, flatPct);
            } else if (basis === "month_seq" && tiers.length) {
                const attr = patByHn[hn]?.attr;
                const monthIdx = attr ? monthsBetween(attr, date) + 1 : 1;
                pct = pctForIndex(tiers, monthIdx, flatPct);
            }
            out.push({
                inv_id: inv.id as string, hn, patient_name: patByHn[hn]?.name || hn,
                invoice_date: date, sale_amount: sale, pct, commission: round2(sale * pct / 100),
            });
        }

        // ── บิลที่ฉันได้ส่วนแบ่ง แต่ไม่ใช่ลูกค้า primary ของฉัน (เซลล์คนที่สองช่วยปิด) ──
        const secondaryIds = Object.keys(myPctByInv).filter(id => !primaryInvIds.includes(id));
        if (secondaryIds.length) {
            const { data: sInvs } = await supabase.from("invoice_headers")
                .select("id, hn, invoice_date, paid_amount, total_amount, status")
                .in("id", secondaryIds).eq("status", "paid");
            const sList = sInvs || [];
            const sHns = [...new Set(sList.map(i => i.hn as string))];
            const nameByHn: Record<string, string> = {};
            if (sHns.length) {
                const { data: sp } = await supabase.from("patients").select("hn, first_name, last_name").in("hn", sHns).eq("clinic_id", clinicId);
                (sp || []).forEach(p => { nameByHn[p.hn as string] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || (p.hn as string); });
            }
            for (const inv of sList) {
                const date = inv.invoice_date as string;
                if (!date || !date.startsWith(periodMonth)) continue;
                const sp = myPctByInv[inv.id as string];
                const sale = Number(inv.paid_amount ?? inv.total_amount ?? 0);
                out.push({
                    inv_id: inv.id as string, hn: inv.hn as string, patient_name: nameByHn[inv.hn as string] || (inv.hn as string),
                    invoice_date: date, sale_amount: sale, pct: sp, commission: round2(sale * sp / 100), is_split: true,
                });
            }
        }

        out.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
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
            .select("affiliate_id, gross_amount, net_amount, status").eq("clinic_id", clinicId).eq("period_month", periodMonth);
        const payoutMap: Record<string, { gross: number; net: number; status: string }> = {};
        (payouts || []).forEach(p => { payoutMap[p.affiliate_id as string] = { gross: Number(p.gross_amount), net: Number(p.net_amount), status: p.status as string }; });

        const out: AffiliateSummary[] = [];
        for (const a of affs) {
            const { count } = await supabase.from("patients")
                .select("hn", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("affiliate_id", a.id);
            const po = payoutMap[a.id];
            let periodCommission: number;
            let status: PayoutStatus = "none";
            let paidNet: number | null = null;
            if (po) {
                // ปิด/จ่ายแล้ว → ใช้ยอด snapshot (frozen)
                periodCommission = po.gross;
                status = po.status === "paid" ? "paid" : "closed";
                paidNet = po.net;
            } else {
                const ledger = await getAffiliateLedger(a.id, periodMonth);
                periodCommission = ledger.total;
            }
            out.push({
                affiliate: a,
                patient_count: count ?? 0,
                period_commission: periodCommission,
                is_paid: status === "paid",
                payout_status: status,
                paid_net: paidNet,
            });
        }
        return out;
    } catch {
        return [];
    }
}

/** บันทึกจ่ายเงิน affiliate (หัก 3% ณ ที่จ่าย) — ถ้าปิดยอดไว้แล้วใช้ยอด snapshot */
export async function recordAffiliatePayout(affiliateId: string, periodMonth: string, opts?: { note?: string }) {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        // ถ้ามีแถวอยู่แล้ว (ปิดยอดไว้) → ใช้ยอด snapshot เดิม แค่เปลี่ยนสถานะเป็นจ่ายแล้ว
        const { data: existing } = await supabase.from("affiliate_payouts")
            .select("status").eq("clinic_id", clinicId).eq("affiliate_id", affiliateId).eq("period_month", periodMonth).maybeSingle();
        if (existing) {
            if (existing.status === "paid") return { success: false, error: "จ่ายแล้ว" };
            const { error } = await supabase.from("affiliate_payouts")
                .update({ status: "paid", paid_by: userId, paid_at: new Date().toISOString(), note: opts?.note || null })
                .eq("clinic_id", clinicId).eq("affiliate_id", affiliateId).eq("period_month", periodMonth);
            if (error) return { success: false, error: error.message };
        } else {
            // จ่ายตรงโดยไม่ปิดยอดก่อน → snapshot จากยอดสด
            const ledger = await getAffiliateLedger(affiliateId, periodMonth);
            const gross = ledger.total;
            if (gross <= 0) return { success: false, error: "ไม่มียอดให้จ่าย" };
            const wht = round2(gross * WHT_RATE);
            const net = round2(gross - wht);
            const { error } = await supabase.from("affiliate_payouts").insert({
                clinic_id: clinicId, affiliate_id: affiliateId, period_month: periodMonth,
                gross_amount: gross, wht_amount: wht, net_amount: net, status: "paid",
                paid_by: userId, note: opts?.note || null, paid_at: new Date().toISOString(),
            });
            if (error) return { success: false, error: error.message };
        }
        revalidatePath("/dashboard/affiliates");
        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ปิดยอดทั้งเดือน — snapshot ทุก affiliate ที่มียอด>0 เป็น 'closed' + ล็อกเดือน + (option) แจ้ง LINE */
export async function closeAffiliateMonth(periodMonth: string, opts?: { payDate?: string; notify?: boolean }) {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        const affs = await listAffiliates();
        const { data: existRows } = await supabase.from("affiliate_payouts")
            .select("affiliate_id").eq("clinic_id", clinicId).eq("period_month", periodMonth);
        const already = new Set((existRows || []).map(r => r.affiliate_id as string));

        const toInsert: Record<string, unknown>[] = [];
        for (const a of affs) {
            if (already.has(a.id)) continue;            // มีแถวแล้ว (ปิด/จ่ายแล้ว) ข้าม
            const ledger = await getAffiliateLedger(a.id, periodMonth);
            const gross = ledger.total;
            if (gross <= 0) continue;                   // ไม่มียอด ไม่ต้องปิด
            const wht = round2(gross * WHT_RATE);
            toInsert.push({
                clinic_id: clinicId, affiliate_id: a.id, period_month: periodMonth,
                gross_amount: gross, wht_amount: wht, net_amount: round2(gross - wht),
                status: "closed", closed_by: userId, closed_at: new Date().toISOString(), paid_at: null,
            });
        }
        if (toInsert.length) {
            const { error } = await supabase.from("affiliate_payouts").insert(toInsert);
            if (error) return { success: false, error: error.message };
        }
        // ล็อกเดือน (idempotent)
        await supabase.from("affiliate_month_locks").upsert(
            { clinic_id: clinicId, period_month: periodMonth, locked_by: userId, locked_at: new Date().toISOString() },
            { onConflict: "clinic_id,period_month" }
        );

        // แจ้ง LINE เฉพาะเซลล์ที่เพิ่งปิดยอด (ยอด>0) + ผูก LINE ไว้
        const closedIds = new Set(toInsert.map(r => r.affiliate_id as string));
        let notified = 0;
        if (opts?.notify !== false) {
            for (const a of affs) {
                if (!a.line_user_id || !closedIds.has(a.id)) continue;
                const r = await notifyAffiliatePayout(a.id, periodMonth, { payDate: opts?.payDate });
                if (r.success) notified++;
            }
        }
        revalidatePath("/dashboard/affiliates");
        return { success: true, closed: toInsert.length, notified };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** เปิดยอดกลับ (ยกเลิกปิดเดือน) — ลบเฉพาะแถวที่ยัง 'closed' (ยังไม่จ่าย) + ปลดล็อก */
export async function reopenAffiliateMonth(periodMonth: string) {
    try {
        const { supabase, clinicId } = await ctxManage();
        await supabase.from("affiliate_payouts").delete()
            .eq("clinic_id", clinicId).eq("period_month", periodMonth).eq("status", "closed");
        await supabase.from("affiliate_month_locks").delete()
            .eq("clinic_id", clinicId).eq("period_month", periodMonth);
        revalidatePath("/dashboard/affiliates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** สถานะล็อกของเดือน */
export async function getMonthLock(periodMonth: string): Promise<{ locked: boolean; locked_at: string | null }> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("affiliate_month_locks")
            .select("locked_at").eq("clinic_id", clinicId).eq("period_month", periodMonth).maybeSingle();
        return { locked: !!data, locked_at: (data?.locked_at as string) || null };
    } catch {
        return { locked: false, locked_at: null };
    }
}

/** ยกเลิกการจ่าย — ถ้าเดือนถูกปิดยอดไว้ คืนสถานะเป็น 'closed', ไม่งั้นลบทิ้ง */
export async function deleteAffiliatePayout(affiliateId: string, periodMonth: string) {
    try {
        const { supabase, clinicId } = await ctxManage();
        const lock = await getMonthLock(periodMonth);
        if (lock.locked) {
            const { error } = await supabase.from("affiliate_payouts")
                .update({ status: "closed", paid_at: null, paid_by: null })
                .eq("clinic_id", clinicId).eq("affiliate_id", affiliateId).eq("period_month", periodMonth);
            if (error) return { success: false, error: error.message };
        } else {
            const { error } = await supabase.from("affiliate_payouts").delete()
                .eq("clinic_id", clinicId).eq("affiliate_id", affiliateId).eq("period_month", periodMonth);
            if (error) return { success: false, error: error.message };
        }
        revalidatePath("/dashboard/affiliates");
        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

// ════════════════════════════════════════════════════════════
// M11 Rate Schedule — ค่าคอมหลายขั้น + audit
// ════════════════════════════════════════════════════════════

/** อ่าน rate schedule ปัจจุบันของ affiliate */
export async function getRateSchedule(affiliateId: string): Promise<RateSchedule | null> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data: aff } = await supabase.from("affiliates")
            .select("rate_basis, commission_pct").eq("id", affiliateId).eq("clinic_id", clinicId).maybeSingle();
        if (!aff) return null;
        const { data: tierRows } = await supabase.from("affiliate_rate_tiers")
            .select("from_n, pct").eq("affiliate_id", affiliateId).eq("clinic_id", clinicId).order("from_n");
        return {
            basis: (aff.rate_basis || "flat") as RateBasis,
            flat_pct: Number(aff.commission_pct),
            tiers: (tierRows || []).map(t => ({ from_n: Number(t.from_n), pct: Number(t.pct) })),
        };
    } catch {
        return null;
    }
}

/** บันทึก rate schedule + เขียน audit (snapshot ก่อน/หลัง) */
export async function saveRateSchedule(affiliateId: string, schedule: RateSchedule, note?: string) {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        const basis = schedule.basis;
        if (!["flat", "bill_seq", "month_seq"].includes(basis)) return { success: false, error: "basis ไม่ถูกต้อง" };

        // sanitize tiers
        const tiers = basis === "flat" ? [] : [...schedule.tiers]
            .map(t => ({ from_n: Math.max(1, Math.floor(Number(t.from_n) || 1)), pct: Number(t.pct) }))
            .filter(t => t.pct >= 0 && t.pct <= 100)
            .sort((a, b) => a.from_n - b.from_n);
        // กันซ้ำ from_n
        const seen = new Set<number>();
        for (const t of tiers) {
            if (seen.has(t.from_n)) return { success: false, error: `ขั้นที่ ${t.from_n} ซ้ำกัน` };
            seen.add(t.from_n);
        }
        if (basis !== "flat" && tiers.length === 0) return { success: false, error: "ใส่ขั้นค่าคอมอย่างน้อย 1 แถว" };
        const flatPct = Number(schedule.flat_pct);
        if (flatPct < 0 || flatPct > 100) return { success: false, error: "% ต้องอยู่ 0–100" };

        // snapshot ก่อนแก้
        const oldValue = await getRateSchedule(affiliateId);

        // อัปเดต affiliate (basis + flat pct) — commission_pct ใช้เป็น fallback/flat
        const { error: e1 } = await supabase.from("affiliates")
            .update({ rate_basis: basis, commission_pct: flatPct }).eq("id", affiliateId).eq("clinic_id", clinicId);
        if (e1) return { success: false, error: e1.message };

        // แทนที่ tiers ทั้งชุด
        await supabase.from("affiliate_rate_tiers").delete().eq("affiliate_id", affiliateId).eq("clinic_id", clinicId);
        if (tiers.length) {
            const { error: e2 } = await supabase.from("affiliate_rate_tiers").insert(
                tiers.map(t => ({ clinic_id: clinicId, affiliate_id: affiliateId, from_n: t.from_n, pct: t.pct }))
            );
            if (e2) return { success: false, error: e2.message };
        }

        // เขียน audit
        const newValue: RateSchedule = { basis, flat_pct: flatPct, tiers };
        await supabase.from("affiliate_rate_audit").insert({
            clinic_id: clinicId, affiliate_id: affiliateId, actor_id: userId,
            old_value: oldValue, new_value: newValue, note: note || null,
        });

        revalidatePath("/dashboard/affiliates");
        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

// ════════════════════════════════════════════════════════════
// M12 เอกสารแนบ + ประวัติจ่าย + ใบหัก ณ ที่จ่าย (50 ทวิ)
// ════════════════════════════════════════════════════════════

const DOC_MIME = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const DOC_MAX = 10 * 1024 * 1024;

/** อัปโหลดเอกสาร affiliate (kind: id_card | bank_book) ลง bucket clinic-assets */
export async function uploadAffiliateDoc(formData: FormData) {
    try {
        const { supabase, clinicId } = await ctxManage();
        const file = formData.get("file") as File | null;
        const affiliateId = formData.get("affiliate_id") as string;
        const kind = formData.get("kind") as string;
        if (!file || file.size === 0) return { success: false, error: "ไม่พบไฟล์" };
        if (!affiliateId || !["id_card", "bank_book"].includes(kind)) return { success: false, error: "ข้อมูลไม่ครบ" };
        if (file.size > DOC_MAX) return { success: false, error: "ไฟล์ใหญ่เกิน 10MB" };
        if (!DOC_MIME.has(file.type)) return { success: false, error: `ชนิดไฟล์ไม่รองรับ (${file.type})` };

        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${clinicId}/affiliates/${affiliateId}/${kind}_${crypto.randomUUID()}.${ext}`;
        const buffer = await file.arrayBuffer();
        const { error: upErr } = await supabase.storage.from("clinic-assets").upload(path, buffer, { contentType: file.type, upsert: false });
        if (upErr) return { success: false, error: `อัปโหลดไม่สำเร็จ: ${upErr.message}` };

        const col = kind === "id_card" ? "id_card_path" : "bank_book_path";
        const { data: old } = await supabase.from("affiliates").select(col).eq("id", affiliateId).eq("clinic_id", clinicId).maybeSingle();
        const { error: dbErr } = await supabase.from("affiliates").update({ [col]: path }).eq("id", affiliateId).eq("clinic_id", clinicId);
        if (dbErr) { await supabase.storage.from("clinic-assets").remove([path]); return { success: false, error: dbErr.message }; }
        const oldPath = (old as Record<string, string> | null)?.[col];
        if (oldPath) await supabase.storage.from("clinic-assets").remove([oldPath]);

        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** signed URL สำหรับดูเอกสาร (60 วิ) */
export async function getAffiliateDocUrl(filePath: string): Promise<string | null> {
    try {
        const { supabase } = await ctx();
        const { data } = await supabase.storage.from("clinic-assets").createSignedUrl(filePath, 60);
        return data?.signedUrl || null;
    } catch {
        return null;
    }
}

/** ลบเอกสาร affiliate */
export async function deleteAffiliateDoc(affiliateId: string, kind: "id_card" | "bank_book") {
    try {
        const { supabase, clinicId } = await ctxManage();
        const col = kind === "id_card" ? "id_card_path" : "bank_book_path";
        const { data: row } = await supabase.from("affiliates").select(col).eq("id", affiliateId).eq("clinic_id", clinicId).maybeSingle();
        const p = (row as Record<string, string> | null)?.[col];
        const { error } = await supabase.from("affiliates").update({ [col]: null }).eq("id", affiliateId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        if (p) await supabase.storage.from("clinic-assets").remove([p]);
        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ประวัติการจ่าย — ทั้งคลินิก หรือเฉพาะ affiliate (ย้อนหลังทั้งปี/ทั้งหมด) */
export async function getAffiliatePayoutHistory(opts?: { affiliateId?: string; year?: string }): Promise<PayoutHistoryRow[]> {
    try {
        const { supabase, clinicId } = await ctx();
        let q = supabase.from("affiliate_payouts")
            .select("affiliate_id, period_month, gross_amount, wht_amount, net_amount, status, paid_at, affiliates(name)")
            .eq("clinic_id", clinicId).order("period_month", { ascending: false });
        if (opts?.affiliateId) q = q.eq("affiliate_id", opts.affiliateId);
        if (opts?.year) q = q.gte("period_month", `${opts.year}-01`).lte("period_month", `${opts.year}-12`);
        const { data } = await q;
        return (data || []).map(r => {
            const affRel = r.affiliates as unknown as { name?: string } | { name?: string }[] | null;
            const name = Array.isArray(affRel) ? affRel[0]?.name : affRel?.name;
            return {
                affiliate_id: r.affiliate_id as string,
                affiliate_name: name || "—",
                period_month: r.period_month as string,
                gross_amount: Number(r.gross_amount),
                wht_amount: Number(r.wht_amount),
                net_amount: Number(r.net_amount),
                status: r.status as string,
                paid_at: (r.paid_at as string) || null,
            };
        });
    } catch {
        return [];
    }
}

export interface WhtCertData {
    clinic: { name: string; name_en: string | null; tax_id: string | null; address: string | null; phone: string | null } | null;
    affiliate: { name: string; id_card: string | null; address: string | null } | null;
    period_month: string;
    gross: number;
    wht: number;
    net: number;
    paid_at: string | null;
    status: string | null;
}

/** ข้อมูลใบหัก ณ ที่จ่าย 50 ทวิ ของ affiliate ในเดือน */
export async function getAffiliateWhtCert(affiliateId: string, periodMonth: string): Promise<WhtCertData> {
    const empty: WhtCertData = { clinic: null, affiliate: null, period_month: periodMonth, gross: 0, wht: 0, net: 0, paid_at: null, status: null };
    try {
        const { supabase, clinicId } = await ctx();
        const { data: tenant } = await supabase.from("tenants")
            .select("clinic_name, clinic_name_en, tax_id, address_detail, phone").eq("id", clinicId).maybeSingle();
        const { data: aff } = await supabase.from("affiliates")
            .select("name, note").eq("id", affiliateId).eq("clinic_id", clinicId).maybeSingle();
        if (!aff) return empty;

        // ใช้ยอด snapshot ถ้ามี payout row มิฉะนั้นคำนวณสด
        const { data: po } = await supabase.from("affiliate_payouts")
            .select("gross_amount, wht_amount, net_amount, paid_at, status")
            .eq("clinic_id", clinicId).eq("affiliate_id", affiliateId).eq("period_month", periodMonth).maybeSingle();
        let gross: number, wht: number, net: number, paidAt: string | null = null, status: string | null = null;
        if (po) {
            gross = Number(po.gross_amount); wht = Number(po.wht_amount); net = Number(po.net_amount);
            paidAt = (po.paid_at as string) || null; status = po.status as string;
        } else {
            const ledger = await getAffiliateLedger(affiliateId, periodMonth);
            gross = ledger.total; wht = round2(gross * WHT_RATE); net = round2(gross - wht);
        }
        return {
            clinic: tenant ? {
                name: (tenant.clinic_name as string) || "—", name_en: (tenant.clinic_name_en as string) || null,
                tax_id: (tenant.tax_id as string) || null, address: (tenant.address_detail as string) || null,
                phone: (tenant.phone as string) || null,
            } : null,
            affiliate: { name: aff.name as string, id_card: null, address: null },
            period_month: periodMonth, gross, wht, net, paid_at: paidAt, status,
        };
    } catch {
        return empty;
    }
}

/** ประวัติการแก้ rate ของ affiliate */
export async function getRateAudit(affiliateId: string): Promise<RateAuditEntry[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("affiliate_rate_audit")
            .select("id, actor_id, old_value, new_value, note, created_at")
            .eq("affiliate_id", affiliateId).eq("clinic_id", clinicId)
            .order("created_at", { ascending: false }).limit(50);
        const rows = data || [];
        // ดึงชื่อผู้แก้
        const actorIds = [...new Set(rows.map(r => r.actor_id).filter(Boolean))] as string[];
        const nameById: Record<string, string> = {};
        if (actorIds.length) {
            const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
            (profs || []).forEach(p => { nameById[p.id as string] = (p.full_name as string) || ""; });
        }
        return rows.map(r => ({
            id: r.id as string,
            actor_name: r.actor_id ? (nameById[r.actor_id as string] || null) : null,
            old_value: (r.old_value as RateSchedule) || null,
            new_value: (r.new_value as RateSchedule) || null,
            note: (r.note as string) || null,
            created_at: r.created_at as string,
        }));
    } catch {
        return [];
    }
}

// ════════════════════════════════════════════════════════════
// M13 Performance Quality — LTV + Retention (นิยาม: ลูกค้าถึงบิลที่ 3+)
// ════════════════════════════════════════════════════════════

const RETENTION_MIN_BILLS = 3;     // ลูกค้าถึงบิลที่ 3 ขึ้นไป = retention
const BADGE_GOLD = 50, BADGE_SILVER = 30;   // retention rate (%) เกณฑ์ badge

export interface AffiliateQuality {
    customer_count: number;     // ลูกค้าที่พามา (มีบิลจ่ายแล้ว ≥1)
    total_revenue: number;      // ยอดขายรวมที่ลูกค้ากลุ่มนี้สร้าง
    ltv: number;                // LTV เฉลี่ยต่อลูกค้า
    repeat_count: number;       // ลูกค้าที่ถึงบิลที่ 3+
    retention_rate: number;     // repeat_count / customer_count × 100
    badge: "gold" | "silver" | "none";
    suggested_bonus_pct: number; // แนะนำโบนัส % (display only)
}

/** เมตริกคุณภาพของเซลล์: LTV เฉลี่ย + retention (ลูกค้าซื้อซ้ำถึงบิลที่ 3+) */
export async function getAffiliateQuality(affiliateId: string): Promise<AffiliateQuality> {
    const empty: AffiliateQuality = { customer_count: 0, total_revenue: 0, ltv: 0, repeat_count: 0, retention_rate: 0, badge: "none", suggested_bonus_pct: 0 };
    try {
        const { supabase, clinicId } = await ctx();
        const { data: pats } = await supabase.from("patients")
            .select("hn").eq("clinic_id", clinicId).eq("affiliate_id", affiliateId);
        const hns = (pats || []).map(p => p.hn as string);
        if (hns.length === 0) return empty;

        const { data: invs } = await supabase.from("invoice_headers")
            .select("hn, paid_amount, total_amount").in("hn", hns).eq("status", "paid");
        const billsByHn: Record<string, number> = {};
        const revByHn: Record<string, number> = {};
        (invs || []).forEach(i => {
            const hn = i.hn as string;
            billsByHn[hn] = (billsByHn[hn] || 0) + 1;
            revByHn[hn] = (revByHn[hn] || 0) + Number(i.paid_amount ?? i.total_amount ?? 0);
        });
        const activeHns = Object.keys(billsByHn);            // ลูกค้าที่มีบิลจ่ายแล้วจริง
        const customerCount = activeHns.length;
        if (customerCount === 0) return empty;
        const totalRevenue = round2(activeHns.reduce((s, hn) => s + revByHn[hn], 0));
        const repeatCount = activeHns.filter(hn => billsByHn[hn] >= RETENTION_MIN_BILLS).length;
        const ltv = round2(totalRevenue / customerCount);
        const retentionRate = round2((repeatCount / customerCount) * 100);
        const badge: AffiliateQuality["badge"] = retentionRate >= BADGE_GOLD ? "gold" : retentionRate >= BADGE_SILVER ? "silver" : "none";
        const suggestedBonus = badge === "gold" ? 10 : badge === "silver" ? 5 : 0;
        return { customer_count: customerCount, total_revenue: totalRevenue, ltv, repeat_count: repeatCount, retention_rate: retentionRate, badge, suggested_bonus_pct: suggestedBonus };
    } catch {
        return empty;
    }
}

// ════════════════════════════════════════════════════════════
// M14 Attribution Conflict Resolution — โอนสิทธิ์ + แบ่งบิล
// ════════════════════════════════════════════════════════════

export interface AttributionLogEntry {
    id: string;
    hn: string;
    old_name: string | null;
    new_name: string | null;
    actor_name: string | null;
    reason: string | null;
    created_at: string;
}

/** โอนสิทธิ์ดูแลลูกค้า (เปลี่ยนเซลล์คนแรก) + บันทึก log — แก้ข้อพิพาท */
export async function transferAttribution(hn: string, newAffiliateId: string | null, reason: string) {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        const { data: pat } = await supabase.from("patients")
            .select("affiliate_id").eq("clinic_id", clinicId).eq("hn", hn).maybeSingle();
        if (!pat) return { success: false, error: "ไม่พบลูกค้า (HN)" };
        const oldId = (pat.affiliate_id as string) || null;
        if (oldId === newAffiliateId) return { success: false, error: "เซลล์เดิมกับใหม่เป็นคนเดียวกัน" };
        if (!reason.trim()) return { success: false, error: "กรุณาระบุเหตุผลการโอน" };

        const patch: Record<string, unknown> = { affiliate_id: newAffiliateId };
        if (newAffiliateId) patch.affiliate_attributed_at = new Date().toISOString().slice(0, 10);
        const { error } = await supabase.from("patients").update(patch).eq("clinic_id", clinicId).eq("hn", hn);
        if (error) return { success: false, error: error.message };

        await supabase.from("affiliate_attribution_log").insert({
            clinic_id: clinicId, hn, old_affiliate_id: oldId, new_affiliate_id: newAffiliateId,
            actor_id: userId, reason: reason.trim(),
        });
        revalidatePath("/dashboard/affiliates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ประวัติการโอนสิทธิ์ของลูกค้า (หรือทั้งคลินิก) */
export async function getAttributionLog(hn?: string): Promise<AttributionLogEntry[]> {
    try {
        const { supabase, clinicId } = await ctx();
        let q = supabase.from("affiliate_attribution_log")
            .select("id, hn, old_affiliate_id, new_affiliate_id, actor_id, reason, created_at")
            .eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(100);
        if (hn) q = q.eq("hn", hn);
        const { data } = await q;
        const rows = data || [];
        const affIds = [...new Set(rows.flatMap(r => [r.old_affiliate_id, r.new_affiliate_id]).filter(Boolean))] as string[];
        const actorIds = [...new Set(rows.map(r => r.actor_id).filter(Boolean))] as string[];
        const affName: Record<string, string> = {};
        const actorName: Record<string, string> = {};
        if (affIds.length) { const { data: a } = await supabase.from("affiliates").select("id, name").in("id", affIds); (a || []).forEach(x => { affName[x.id as string] = x.name as string; }); }
        if (actorIds.length) { const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", actorIds); (p || []).forEach(x => { actorName[x.id as string] = (x.full_name as string) || ""; }); }
        return rows.map(r => ({
            id: r.id as string,
            hn: r.hn as string,
            old_name: r.old_affiliate_id ? (affName[r.old_affiliate_id as string] || "—") : "ไม่มี",
            new_name: r.new_affiliate_id ? (affName[r.new_affiliate_id as string] || "—") : "ไม่มี",
            actor_name: r.actor_id ? (actorName[r.actor_id as string] || null) : null,
            reason: (r.reason as string) || null,
            created_at: r.created_at as string,
        }));
    } catch {
        return [];
    }
}

export interface InvoiceSplitInfo {
    sale: number;
    primary: { id: string; name: string } | null;
    splits: { affiliate_id: string; affiliate_name: string; pct: number }[];
}

/** ดูส่วนแบ่งของบิล + เซลล์ primary + ยอดขาย */
export async function getInvoiceSplits(invId: string): Promise<InvoiceSplitInfo> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data: inv } = await supabase.from("invoice_headers")
            .select("hn, paid_amount, total_amount").eq("id", invId).maybeSingle();
        const sale = inv ? Number(inv.paid_amount ?? inv.total_amount ?? 0) : 0;
        let primary: { id: string; name: string } | null = null;
        if (inv?.hn) {
            const { data: pat } = await supabase.from("patients").select("affiliate_id").eq("clinic_id", clinicId).eq("hn", inv.hn).maybeSingle();
            if (pat?.affiliate_id) {
                const { data: a } = await supabase.from("affiliates").select("id, name").eq("id", pat.affiliate_id).maybeSingle();
                if (a) primary = { id: a.id as string, name: a.name as string };
            }
        }
        const { data: rows } = await supabase.from("affiliate_invoice_splits")
            .select("affiliate_id, pct, affiliates(name)").eq("clinic_id", clinicId).eq("inv_id", invId);
        const splits = (rows || []).map(r => {
            const rel = r.affiliates as unknown as { name?: string } | { name?: string }[] | null;
            const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
            return { affiliate_id: r.affiliate_id as string, affiliate_name: name || "—", pct: Number(r.pct) };
        });
        return { sale, primary, splits };
    } catch {
        return { sale: 0, primary: null, splits: [] };
    }
}

// ════════════════════════════════════════════════════════════
// M16 แจ้งเตือนยอดผ่าน LINE
// ════════════════════════════════════════════════════════════

function payoutMessage(name: string, periodMonth: string, patientCount: number, gross: number, wht: number, net: number, payDate?: string | null): string {
    const [y, m] = periodMonth.split("-").map(Number);
    const monthTh = new Date(y, m - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" });
    const f = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    let msg = `📊 สรุปค่าคอมมิชชั่น\nเรียน คุณ${name}\n\nงวด: ${monthTh}\nลูกค้าที่พามา (สะสม): ${patientCount} ราย\n\nยอดค่าคอม: ${f(gross)}\nหัก ณ ที่จ่าย 3%: ${f(wht)}\nยอดสุทธิที่จะได้รับ: ${f(net)}`;
    if (payDate) {
        const d = new Date(payDate + "T00:00:00");
        msg += `\n\n💰 กำหนดโอน: ${d.toLocaleDateString("th-TH", { dateStyle: "long" })}`;
    }
    msg += `\n\nขอบคุณที่ร่วมงานกันครับ 🙏`;
    return msg;
}

/** สร้างรหัสผูก LINE (ใช้ครั้งเดียว) — เซลล์ส่งรหัสนี้เข้า OA เพื่อผูกบัญชี */
export async function generateAffiliateLinkCode(affiliateId: string): Promise<{ success: boolean; code?: string; error?: string }> {
    try {
        const { supabase, clinicId } = await ctxManage();
        const code = "AFF-" + Math.random().toString(36).slice(2, 8).toUpperCase();
        const { error } = await supabase.from("affiliates").update({ line_link_code: code })
            .eq("id", affiliateId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true, code };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ยกเลิกการผูก LINE */
export async function unlinkAffiliateLine(affiliateId: string) {
    try {
        const { supabase, clinicId } = await ctxManage();
        const { error } = await supabase.from("affiliates")
            .update({ line_user_id: null, line_link_code: null }).eq("id", affiliateId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ส่งสรุปยอดให้เซลล์ทาง LINE (manual หรือเรียกตอนปิดยอด) */
export async function notifyAffiliatePayout(affiliateId: string, periodMonth: string, opts?: { payDate?: string }): Promise<{ success: boolean; error?: string }> {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        const { data: aff } = await supabase.from("affiliates")
            .select("name, line_user_id").eq("id", affiliateId).eq("clinic_id", clinicId).maybeSingle();
        if (!aff) return { success: false, error: "ไม่พบเซลล์" };
        if (!aff.line_user_id) return { success: false, error: "เซลล์ยังไม่ได้ผูก LINE" };

        // ใช้ยอด snapshot ถ้ามี payout row มิฉะนั้นคำนวณสด
        const { data: po } = await supabase.from("affiliate_payouts")
            .select("gross_amount, wht_amount, net_amount").eq("clinic_id", clinicId).eq("affiliate_id", affiliateId).eq("period_month", periodMonth).maybeSingle();
        let gross: number, wht: number, net: number;
        if (po) { gross = Number(po.gross_amount); wht = Number(po.wht_amount); net = Number(po.net_amount); }
        else { const l = await getAffiliateLedger(affiliateId, periodMonth); gross = l.total; wht = round2(gross * WHT_RATE); net = round2(gross - wht); }

        const { count } = await supabase.from("patients")
            .select("hn", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("affiliate_id", affiliateId);

        const msg = payoutMessage(aff.name as string, periodMonth, count ?? 0, gross, wht, net, opts?.payDate);
        const r = await pushLineText(aff.line_user_id as string, msg);
        await supabase.from("affiliate_line_notify_log").insert({
            clinic_id: clinicId, affiliate_id: affiliateId, period_month: periodMonth,
            sent_by: userId, ok: r.ok, error: r.ok ? null : (r.error || "error"),
        });
        if (!r.ok) return { success: false, error: r.error || "ส่ง LINE ไม่สำเร็จ" };
        revalidatePath(`/dashboard/affiliates/${affiliateId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ตั้งส่วนแบ่งบิล (override) — ส่ง [] เพื่อยกเลิกการแบ่ง กลับไป attribution ปกติ */
export async function setInvoiceSplit(invId: string, splits: { affiliate_id: string; pct: number }[], note?: string) {
    try {
        const { supabase, userId, clinicId } = await ctxManage();
        const clean = splits
            .filter(s => s.affiliate_id && Number(s.pct) > 0)
            .map(s => ({ affiliate_id: s.affiliate_id, pct: Number(s.pct) }));
        // กัน affiliate ซ้ำ + ผลรวมไม่เกิน 100
        const ids = new Set<string>();
        let sum = 0;
        for (const s of clean) {
            if (ids.has(s.affiliate_id)) return { success: false, error: "เลือกเซลล์ซ้ำกัน" };
            ids.add(s.affiliate_id);
            if (s.pct > 100) return { success: false, error: "% ต้องไม่เกิน 100" };
            sum += s.pct;
        }
        if (sum > 100) return { success: false, error: `ผลรวม % เกิน 100 (${sum}%)` };

        // แทนที่ทั้งชุด
        await supabase.from("affiliate_invoice_splits").delete().eq("clinic_id", clinicId).eq("inv_id", invId);
        if (clean.length) {
            const { error } = await supabase.from("affiliate_invoice_splits").insert(
                clean.map(s => ({ clinic_id: clinicId, inv_id: invId, affiliate_id: s.affiliate_id, pct: s.pct, note: note || null, created_by: userId }))
            );
            if (error) return { success: false, error: error.message };
        }
        revalidatePath("/dashboard/affiliates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
