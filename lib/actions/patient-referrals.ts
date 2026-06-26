"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { awardPoints } from "./loyalty";

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

const genCode = () => "RF" + Math.random().toString(36).slice(2, 8).toUpperCase();

export interface ReferredItem {
    id: string;
    referred_hn: string;
    referred_name: string;
    has_sales: boolean;       // ลูกค้าใหม่มียอดขายจริงแล้ว → รางวัล "รอเลือก"
    reward_status: string;    // pending | cash | discount | points | cancelled
    reward_amount: number;
    reward_points: number;
    created_at: string;
    claimed_at: string | null;
}

/** สร้าง/ดึง referral code ของผู้ป่วย (สร้างถ้ายังไม่มี) */
export async function ensureReferralCode(hn: string): Promise<string> {
    const { supabase, clinicId } = await ctx();
    const { data: p } = await supabase.from("patients").select("referral_code").eq("hn", hn).maybeSingle();
    if (p?.referral_code) return p.referral_code as string;
    for (let i = 0; i < 5; i++) {
        const code = genCode();
        const { error } = await supabase.from("patients").update({ referral_code: code }).eq("hn", hn).eq("clinic_id", clinicId);
        if (!error) { revalidatePath(`/dashboard/patients/${hn}`); return code; }
    }
    return "";
}

/** บันทึกการแนะนำ (ตอนลงทะเบียนลูกค้าใหม่ที่ใส่รหัสเพื่อน) + กันโกง */
export async function recordReferral(referrerCode: string, referredHn: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const code = referrerCode.trim().toUpperCase();
        if (!code) return { success: false, error: "ไม่มีรหัส" };

        const { data: referrer } = await supabase.from("patients")
            .select("hn, phone, thai_id_card").eq("clinic_id", clinicId).eq("referral_code", code).maybeSingle();
        if (!referrer) return { success: false, error: "ไม่พบรหัสแนะนำนี้" };
        if (referrer.hn === referredHn) return { success: false, error: "แนะนำตัวเองไม่ได้" };

        // กันโกง — เบอร์/เลขบัตรซ้ำกับผู้แนะนำ
        const { data: referred } = await supabase.from("patients")
            .select("phone, thai_id_card").eq("hn", referredHn).maybeSingle();
        if (referred) {
            if (referrer.phone && referred.phone && referrer.phone === referred.phone)
                return { success: false, error: "เบอร์โทรซ้ำกับผู้แนะนำ" };
            if (referrer.thai_id_card && referred.thai_id_card && referrer.thai_id_card === referred.thai_id_card)
                return { success: false, error: "เลขบัตรซ้ำกับผู้แนะนำ" };
        }

        const { error } = await supabase.from("patient_referrals").insert({
            clinic_id: clinicId, referrer_hn: referrer.hn, referred_hn: referredHn, reward_status: "pending",
        });
        if (error) return { success: false, error: error.message.includes("duplicate") ? "ลูกค้านี้ถูกบันทึกการแนะนำแล้ว" : error.message };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** รายการคนที่ผู้ป่วยรายนี้แนะนำมา + สถานะรางวัล */
export async function getReferralsByReferrer(hn: string): Promise<ReferredItem[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("patient_referrals")
            .select("id, referred_hn, reward_status, reward_amount, reward_points, created_at, claimed_at")
            .eq("clinic_id", clinicId).eq("referrer_hn", hn).order("created_at", { ascending: false });
        const rows = data || [];
        if (rows.length === 0) return [];

        const hns = rows.map(r => r.referred_hn as string);
        const { data: pats } = await supabase.from("patients").select("hn, first_name, last_name").in("hn", hns);
        const nameByHn: Record<string, string> = {};
        (pats || []).forEach(p => { nameByHn[p.hn as string] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || (p.hn as string); });

        // มียอดขายจริงไหม (มีใบเสร็จ paid)
        const { data: invs } = await supabase.from("invoice_headers")
            .select("hn").in("hn", hns).eq("status", "paid");
        const hasSales = new Set((invs || []).map(i => i.hn as string));

        return rows.map(r => ({
            id: r.id as string,
            referred_hn: r.referred_hn as string,
            referred_name: nameByHn[r.referred_hn as string] || (r.referred_hn as string),
            has_sales: hasSales.has(r.referred_hn as string),
            reward_status: r.reward_status as string,
            reward_amount: Number(r.reward_amount || 0),
            reward_points: Number(r.reward_points || 0),
            created_at: r.created_at as string,
            claimed_at: (r.claimed_at as string) || null,
        }));
    } catch {
        return [];
    }
}

export interface ClinicReferral extends ReferredItem {
    referrer_hn: string;
    referrer_name: string;
}

/** ภาพรวม referral ทั้งคลินิก (สำหรับ dashboard) */
export async function getClinicReferrals(): Promise<ClinicReferral[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("patient_referrals")
            .select("id, referrer_hn, referred_hn, reward_status, reward_amount, reward_points, created_at, claimed_at")
            .eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(300);
        const rows = data || [];
        if (rows.length === 0) return [];

        const allHns = [...new Set(rows.flatMap(r => [r.referrer_hn as string, r.referred_hn as string]))];
        const { data: pats } = await supabase.from("patients").select("hn, first_name, last_name").in("hn", allHns);
        const nameByHn: Record<string, string> = {};
        (pats || []).forEach(p => { nameByHn[p.hn as string] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || (p.hn as string); });

        const referredHns = rows.map(r => r.referred_hn as string);
        const { data: invs } = await supabase.from("invoice_headers").select("hn").in("hn", referredHns).eq("status", "paid");
        const hasSales = new Set((invs || []).map(i => i.hn as string));

        return rows.map(r => ({
            id: r.id as string,
            referrer_hn: r.referrer_hn as string,
            referrer_name: nameByHn[r.referrer_hn as string] || (r.referrer_hn as string),
            referred_hn: r.referred_hn as string,
            referred_name: nameByHn[r.referred_hn as string] || (r.referred_hn as string),
            has_sales: hasSales.has(r.referred_hn as string),
            reward_status: r.reward_status as string,
            reward_amount: Number(r.reward_amount || 0),
            reward_points: Number(r.reward_points || 0),
            created_at: r.created_at as string,
            claimed_at: (r.claimed_at as string) || null,
        }));
    } catch {
        return [];
    }
}

/** เลือกรับรางวัล — เงิน/ส่วนลด/แต้ม (แต้มจะบวกเข้า loyalty ของผู้แนะนำ) */
export async function claimReferralReward(
    referralId: string,
    type: "cash" | "discount" | "points",
    value: number,
) {
    try {
        const { supabase, userId, clinicId } = await ctx();
        const { data: ref } = await supabase.from("patient_referrals")
            .select("referrer_hn, reward_status").eq("id", referralId).eq("clinic_id", clinicId).maybeSingle();
        if (!ref) return { success: false, error: "ไม่พบรายการ" };
        if (ref.reward_status !== "pending") return { success: false, error: "รายการนี้เลือกรางวัลไปแล้ว" };
        if (value <= 0) return { success: false, error: "ระบุจำนวนรางวัล" };

        const patch: Record<string, unknown> = {
            reward_status: type, claimed_at: new Date().toISOString(), claimed_by: userId,
            reward_amount: type === "points" ? 0 : value,
            reward_points: type === "points" ? Math.round(value) : 0,
        };
        const { error } = await supabase.from("patient_referrals").update(patch).eq("id", referralId);
        if (error) return { success: false, error: error.message };

        // ถ้าเลือกแต้ม → บวกเข้า loyalty ของผู้แนะนำ (ใช้ระบบเดิม)
        if (type === "points") {
            await awardPoints(ref.referrer_hn as string, Math.round(value), "รางวัลแนะนำเพื่อน");
        }
        revalidatePath(`/dashboard/patients/${ref.referrer_hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ยกเลิกรางวัล (คืนเป็น pending ไม่ได้ถ้าเป็นแต้มที่ให้ไปแล้ว — แค่ mark cancelled) */
export async function cancelReferralReward(referralId: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { error } = await supabase.from("patient_referrals")
            .update({ reward_status: "cancelled" }).eq("id", referralId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
