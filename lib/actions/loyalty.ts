"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { LOYALTY_TIERS, getTierForPoints } from "@/lib/loyalty-tiers";
import { bangkokDate } from "@/lib/utils/date";

/** ดึงข้อมูล loyalty ของผู้ป่วย */
export async function getLoyaltySnapshot(hn: string) {
    try {
        const supabase = await createClient();

        // คะแนนคงเหลือ (จาก function)
        const { data: balanceData, error: balErr } = await supabase
            .rpc("fn_loyalty_balance", { p_hn: hn });
        if (balErr) throw balErr;
        const balance = (balanceData as number) ?? 0;

        // วันครบรอบถัดไป (วันหมดอายุของคะแนนทั้งหมด)
        const { data: patient } = await supabase
            .from("patients").select("first_visit_date")
            .eq("hn", hn).maybeSingle();

        let nextExpiry: string | null = null;
        if (patient?.first_visit_date) {
            const { data: nextAnn } = await supabase
                .rpc("fn_next_anniversary", {
                    p_registration_date: patient.first_visit_date,
                    p_from_date: bangkokDate(),
                });
            nextExpiry = (nextAnn as string) ?? null;
        }

        const tierInfo = getTierForPoints(balance);

        return {
            success: true as const,
            balance,
            nextExpiry,
            ...tierInfo,
        };
    } catch (e) {
        return {
            success: false as const,
            error: e instanceof Error ? e.message : "Error",
            balance: 0,
            nextExpiry: null,
            current: LOYALTY_TIERS[0],
            next: LOYALTY_TIERS[1],
            pointsToNext: 100,
            progressPct: 0,
        };
    }
}

/** ดึงประวัติ transactions */
export async function getLoyaltyHistory(hn: string, limit = 50) {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("loyalty_transactions")
            .select(`
                id, txn_type, points, vn, earned_at, expires_at,
                redeem_item, note, created_at,
                creator:profiles!loyalty_transactions_created_by_fkey(full_name)
            `)
            .eq("hn", hn)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", data: [] };
    }
}

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles")
        .select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Profile not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

async function getNextAnniversary(hn: string): Promise<string | null> {
    const supabase = await createClient();
    const { data: patient } = await supabase
        .from("patients").select("first_visit_date")
        .eq("hn", hn).maybeSingle();
    if (!patient?.first_visit_date) return null;
    const { data } = await supabase.rpc("fn_next_anniversary", {
        p_registration_date: patient.first_visit_date,
        p_from_date: bangkokDate(),
    });
    return (data as string) ?? null;
}

/** Award คะแนนแบบ manual (admin) */
export async function awardPoints(hn: string, points: number, note?: string) {
    try {
        const { supabase, userId, clinicId } = await getCtx();
        if (points <= 0) return { success: false, error: "จำนวนคะแนนต้องมากกว่า 0" };

        const expiresAt = await getNextAnniversary(hn);

        const { error } = await supabase.from("loyalty_transactions").insert({
            clinic_id: clinicId,
            hn,
            txn_type: "earn",
            points,
            earned_at: bangkokDate(),
            expires_at: expiresAt,
            note: note || "เพิ่มคะแนนโดยเจ้าหน้าที่",
            created_by: userId,
        });
        if (error) return { success: false, error: error.message };

        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Redeem (แลกคะแนน) */
export async function redeemPoints(hn: string, points: number, item: string, note?: string) {
    try {
        const { supabase, userId, clinicId } = await getCtx();
        if (points <= 0) return { success: false, error: "จำนวนคะแนนต้องมากกว่า 0" };
        if (!item?.trim()) return { success: false, error: "กรุณาระบุรายการที่แลก" };

        // ตรวจสอบยอดคงเหลือก่อน
        const { data: balData } = await supabase.rpc("fn_loyalty_balance", { p_hn: hn });
        const balance = (balData as number) ?? 0;
        if (balance < points) return { success: false, error: `คะแนนไม่พอ (มี ${balance} คะแนน ต้องการ ${points} คะแนน)` };

        const { error } = await supabase.from("loyalty_transactions").insert({
            clinic_id: clinicId,
            hn,
            txn_type: "redeem",
            points: -Math.abs(points),
            redeem_item: item.trim(),
            note: note?.trim() || null,
            created_by: userId,
        });
        if (error) return { success: false, error: error.message };

        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ปรับคะแนนแบบ manual (admin only) — สามารถใช้ค่าลบเพื่อลดคะแนน */
export async function adjustPoints(hn: string, delta: number, note: string) {
    try {
        const { supabase, userId, clinicId } = await getCtx();
        if (delta === 0) return { success: false, error: "ระบุจำนวนที่ต้องการปรับ" };
        if (!note?.trim()) return { success: false, error: "ต้องระบุเหตุผลในการปรับ" };

        const { error } = await supabase.from("loyalty_transactions").insert({
            clinic_id: clinicId,
            hn,
            txn_type: "adjust",
            points: delta,
            note: note.trim(),
            created_by: userId,
        });
        if (error) return { success: false, error: error.message };

        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
