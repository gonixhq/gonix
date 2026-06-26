"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface CommissionEntry {
    staff_id: string;
    role: string;
    item_id: string;
    item_name: string;
    qty: number;
    df_rate: number;
    commission_amount: number;
    inv_id: string;
    invoice_date: string;
    vn: string;
    patient_name?: string;   // ชื่อลูกค้า (enrich)
    sale_amount?: number;    // ยอดขาย line_total (enrich)
    is_split?: boolean;      // รายการนี้ถูกแบ่งค่ามือ
    split_percent?: number;  // % ที่คนนี้ได้รับจากการแบ่ง
}

/**
 * ดึง entries จาก view แล้ว apply split (override การ attribute ปกติ)
 * รายการที่มี split → แตกเป็นหลาย entry ตาม % · รายการปกติ → คงเดิม
 */
async function attributeEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any, clinicId: string, periodMonth: string, roleFilter?: string,
): Promise<CommissionEntry[]> {
    let q = supabase.from("v_commission_summary").select("*").eq("clinic_id", clinicId).eq("period_month", periodMonth);
    if (roleFilter) q = q.eq("role", roleFilter);
    const { data } = await q;
    const entries = (data || []) as CommissionEntry[];
    const itemIds = [...new Set(entries.map(e => e.item_id).filter(Boolean))];

    const splitMap = new Map<string, { staff_id: string; percent: number }[]>();
    if (itemIds.length) {
        const { data: splitRows } = await supabase
            .from("commission_splits")
            .select("inv_item_id, role, staff_id, percent")
            .eq("clinic_id", clinicId)
            .in("inv_item_id", itemIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (splitRows || []).forEach((s: any) => {
            const k = `${s.inv_item_id}|${s.role}`;
            if (!splitMap.has(k)) splitMap.set(k, []);
            splitMap.get(k)!.push({ staff_id: s.staff_id, percent: Number(s.percent) });
        });
    }

    const out: CommissionEntry[] = [];
    for (const e of entries) {
        const splits = splitMap.get(`${e.item_id}|${e.role}`);
        if (splits && splits.length) {
            for (const sp of splits) {
                out.push({
                    ...e,
                    staff_id: sp.staff_id,
                    commission_amount: Math.round(Number(e.commission_amount) * sp.percent) / 100,
                    is_split: true,
                    split_percent: sp.percent,
                });
            }
        } else {
            out.push(e);
        }
    }
    return out;
}

export interface StaffCommissionSummary {
    staff_id: string;
    staff_name: string;
    role: string;
    period_month: string;
    total_amount: number;       // ยอด live (คำนวณสด) — หรือ snapshot ถ้าอนุมัติแล้ว
    live_amount: number;        // ยอด live เสมอ (เทียบกับ approved)
    entries_count: number;
    is_paid: boolean;
    paid_at?: string | null;
    paid_amount?: number | null;
    is_approved: boolean;       // อนุมัติแล้ว (ล็อกยอด)
    approved_amount?: number | null;
    approved_at?: string | null;
}

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles")
        .select("clinic_id, full_name").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Profile/clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/**
 * ดึงสรุปคอมมิชชั่นของพนักงานทั้งหมด ในเดือนที่กำหนด
 * รวม + คำนวณยอด + ดู status ว่าจ่ายแล้วยัง
 */
export async function getCommissionsByPeriod(periodMonth: string): Promise<StaffCommissionSummary[]> {
    try {
        const { supabase, clinicId } = await getCtx();

        // 1. ดึง entries (apply split แล้ว — รายการที่แบ่งค่ามือจะ re-attribute ให้ถูกคน)
        const entries = await attributeEntries(supabase, clinicId, periodMonth);

        // 2. Group + sum
        const grouped: Record<string, { role: string; total: number; count: number }> = {};
        entries.forEach(e => {
            const key = `${e.staff_id}|${e.role}`;
            if (!grouped[key]) grouped[key] = { role: e.role, total: 0, count: 0 };
            grouped[key].total += Number(e.commission_amount || 0);
            grouped[key].count += 1;
        });

        // 3. ดึงชื่อ staff
        const staffIds = [...new Set(Object.keys(grouped).map(k => k.split("|")[0]))];
        if (staffIds.length === 0) return [];

        const { data: staffList } = await supabase
            .from("staff")
            .select("id, profiles!inner(full_name)")
            .in("id", staffIds);

        const staffNames: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (staffList || []).forEach((s: any) => {
            const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
            staffNames[s.id] = p?.full_name || "—";
        });

        // 4. ดึงข้อมูล payouts (ใครจ่ายแล้วบ้าง)
        const { data: payouts } = await supabase
            .from("commission_payouts")
            .select("staff_id, role, amount, paid_at")
            .eq("clinic_id", clinicId)
            .eq("period_month", periodMonth);

        const paidMap: Record<string, { paid_at: string; amount: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payouts || []).forEach((p: any) => {
            paidMap[`${p.staff_id}|${p.role}`] = { paid_at: p.paid_at, amount: Number(p.amount) };
        });

        // 4b. ดึงข้อมูลการอนุมัติ (ล็อกยอด)
        const { data: approvals } = await supabase
            .from("commission_approvals")
            .select("staff_id, role, approved_amount, approved_at")
            .eq("clinic_id", clinicId)
            .eq("period_month", periodMonth);
        const apprMap: Record<string, { amount: number; at: string }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (approvals || []).forEach((a: any) => {
            apprMap[`${a.staff_id}|${a.role}`] = { amount: Number(a.approved_amount), at: a.approved_at };
        });

        // 5. รวมเป็น summary
        const summary: StaffCommissionSummary[] = Object.entries(grouped).map(([key, val]) => {
            const [staff_id, role] = key.split("|");
            const paid = paidMap[key];
            const appr = apprMap[key];
            return {
                staff_id,
                staff_name: staffNames[staff_id] || "—",
                role,
                period_month: periodMonth,
                // อนุมัติแล้ว → ใช้ snapshot, ยังไม่อนุมัติ → ยอด live
                total_amount: appr ? appr.amount : val.total,
                live_amount: val.total,
                entries_count: val.count,
                is_paid: !!paid,
                paid_at: paid?.paid_at || null,
                paid_amount: paid?.amount || null,
                is_approved: !!appr,
                approved_amount: appr?.amount ?? null,
                approved_at: appr?.at ?? null,
            };
        });

        return summary.sort((a, b) => b.total_amount - a.total_amount);
    } catch {
        return [];
    }
}

/**
 * ดึงรายละเอียดของ staff คนเดียวในเดือนนั้น (สำหรับ print PDF)
 */
export async function getCommissionDetail(
    staffId: string,
    role: string,
    periodMonth: string
): Promise<{ entries: CommissionEntry[]; total: number; staff_name: string; is_approved: boolean; approved_amount: number | null; approved_at: string | null }> {
    try {
        const { supabase, clinicId } = await getCtx();

        // ดึงทั้ง role แล้ว apply split → กรองเฉพาะ entries ที่ตกเป็นของ staff คนนี้
        // (รวมทั้งกรณีเป็นผู้รับส่วนแบ่ง แม้ไม่ใช่ผู้ทำเคสหลัก)
        const attributed = await attributeEntries(supabase, clinicId, periodMonth, role);
        const list = attributed
            .filter(e => e.staff_id === staffId)
            .sort((a, b) => (a.invoice_date < b.invoice_date ? -1 : 1));
        const total = list.reduce((s, e) => s + Number(e.commission_amount || 0), 0);

        // Enrich: ยอดขาย (line_total) + ชื่อลูกค้า — โดยไม่แตะ view
        const itemIds = [...new Set(list.map(e => e.item_id).filter(Boolean))];
        const invIds = [...new Set(list.map(e => e.inv_id).filter(Boolean))];
        const [itemsRes, invRes] = await Promise.all([
            itemIds.length ? supabase.from("invoice_items").select("id, line_total").in("id", itemIds) : Promise.resolve({ data: [] }),
            invIds.length ? supabase.from("invoice_headers").select("id, hn").in("id", invIds) : Promise.resolve({ data: [] }),
        ]);
        const lineTotalById: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (itemsRes.data || []).forEach((r: any) => { lineTotalById[r.id] = Number(r.line_total || 0); });
        const hnByInv: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (invRes.data || []).forEach((r: any) => { hnByInv[r.id] = r.hn; });
        const hns = [...new Set(Object.values(hnByInv).filter(Boolean))];
        const nameByHn: Record<string, string> = {};
        if (hns.length) {
            const { data: pats } = await supabase.from("patients").select("hn, first_name, last_name").in("hn", hns);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (pats || []).forEach((p: any) => { nameByHn[p.hn] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.hn; });
        }
        list.forEach(e => {
            e.sale_amount = lineTotalById[e.item_id] ?? 0;
            e.patient_name = nameByHn[hnByInv[e.inv_id]] ?? "—";
        });

        // ชื่อ staff
        const { data: staff } = await supabase
            .from("staff")
            .select("id, profiles!inner(full_name)")
            .eq("id", staffId).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sp = staff?.profiles as any;
        const staff_name = (Array.isArray(sp) ? sp[0]?.full_name : sp?.full_name) || "—";

        // สถานะอนุมัติ
        const { data: appr } = await supabase
            .from("commission_approvals")
            .select("approved_amount, approved_at, approved_by")
            .eq("clinic_id", clinicId).eq("staff_id", staffId).eq("role", role).eq("period_month", periodMonth)
            .maybeSingle();

        return {
            entries: list, total, staff_name,
            is_approved: !!appr,
            approved_amount: appr ? Number(appr.approved_amount) : null,
            approved_at: appr?.approved_at ?? null,
        };
    } catch {
        return { entries: [], total: 0, staff_name: "—", is_approved: false, approved_amount: null, approved_at: null };
    }
}

/** อนุมัติ + ล็อกยอด DF ของ staff รายงวด (snapshot ยอด ณ ตอนนี้) */
export async function approveCommission(input: {
    staff_id: string; role: string; period_month: string;
}) {
    try {
        const { supabase, userId, clinicId } = await getCtx();
        // คำนวณยอด live (apply split แล้ว) ณ ตอนนี้เพื่อ snapshot
        const attributed = await attributeEntries(supabase, clinicId, input.period_month, input.role);
        const mine = attributed.filter(e => e.staff_id === input.staff_id);
        const amount = mine.reduce((s, e) => s + Number(e.commission_amount || 0), 0);
        const count = mine.length;

        const { error } = await supabase.from("commission_approvals").upsert({
            clinic_id: clinicId,
            staff_id: input.staff_id,
            role: input.role,
            period_month: input.period_month,
            approved_amount: amount,
            entries_count: count,
            approved_by: userId,
            approved_at: new Date().toISOString(),
        }, { onConflict: "clinic_id,staff_id,role,period_month" });
        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/commissions");
        return { success: true, approved_amount: amount };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ยกเลิกการอนุมัติ (ปลดล็อก) — ทำได้ถ้ายังไม่จ่าย */
export async function unapproveCommission(staffId: string, role: string, periodMonth: string) {
    try {
        const { supabase, clinicId } = await getCtx();
        // กันปลดล็อกถ้าจ่ายไปแล้ว
        const { data: paid } = await supabase.from("commission_payouts")
            .select("id").eq("clinic_id", clinicId).eq("staff_id", staffId).eq("period_month", periodMonth).maybeSingle();
        if (paid) return { success: false, error: "จ่ายไปแล้ว ปลดล็อกไม่ได้" };

        const { error } = await supabase.from("commission_approvals").delete()
            .eq("clinic_id", clinicId).eq("staff_id", staffId).eq("role", role).eq("period_month", periodMonth);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/commissions");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/**
 * บันทึกการจ่าย commission (จ่ายแล้ว)
 */
export async function recordCommissionPayout(input: {
    staff_id: string;
    role: string;
    period_month: string;
    amount: number;
    payment_method?: "cash" | "transfer" | "payroll";
    transaction_ref?: string;
    note?: string;
}) {
    try {
        const { supabase, userId, clinicId } = await getCtx();

        if (!input.amount || input.amount <= 0) {
            return { success: false, error: "ยอดจ่ายต้องมากกว่า 0" };
        }

        const { error } = await supabase
            .from("commission_payouts")
            .upsert({
                clinic_id: clinicId,
                staff_id: input.staff_id,
                role: input.role,
                period_month: input.period_month,
                amount: input.amount,
                paid_by: userId,
                payment_method: input.payment_method || "cash",
                transaction_ref: input.transaction_ref || null,
                note: input.note || null,
            }, {
                onConflict: "clinic_id,staff_id,period_month",
            });

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/commissions");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ลบการจ่าย (กรณีบันทึกผิด) */
export async function deleteCommissionPayout(staffId: string, periodMonth: string) {
    try {
        const { supabase, clinicId } = await getCtx();
        const { error } = await supabase
            .from("commission_payouts")
            .delete()
            .eq("clinic_id", clinicId)
            .eq("staff_id", staffId)
            .eq("period_month", periodMonth);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/commissions");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

// ════════════════════════════════════════════════════════════
// Split Commission — แบ่ง DF 1 รายการให้หลายคน
// ════════════════════════════════════════════════════════════

export interface SplitRow { staff_id: string; staff_name: string; percent: number; }
export interface StaffOption { id: string; name: string; }

/** รายชื่อ staff สำหรับเลือกผู้รับส่วนแบ่ง */
export async function listStaffOptions(): Promise<StaffOption[]> {
    try {
        const { supabase, clinicId } = await getCtx();
        const { data } = await supabase
            .from("staff")
            .select("id, profiles!inner(full_name)")
            .eq("clinic_id", clinicId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data || []).map((s: any) => {
            const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
            return { id: s.id, name: p?.full_name || "—" };
        });
    } catch {
        return [];
    }
}

/** ดึงการแบ่งปัจจุบันของ (รายการ, role) */
export async function getItemSplits(invItemId: string, role: string): Promise<SplitRow[]> {
    try {
        const { supabase, clinicId } = await getCtx();
        const { data } = await supabase
            .from("commission_splits")
            .select("staff_id, percent, staff!inner(profiles!inner(full_name))")
            .eq("clinic_id", clinicId).eq("inv_item_id", invItemId).eq("role", role);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data || []).map((r: any) => {
            const st = Array.isArray(r.staff) ? r.staff[0] : r.staff;
            const p = Array.isArray(st?.profiles) ? st.profiles[0] : st?.profiles;
            return { staff_id: r.staff_id, staff_name: p?.full_name || "—", percent: Number(r.percent) };
        });
    } catch {
        return [];
    }
}

/** ตั้งค่าการแบ่ง (replace ทั้งหมด) — % รวมต้อง = 100, ลบทิ้งถ้าส่งว่าง */
export async function setItemSplits(
    invItemId: string, role: string, splits: { staff_id: string; percent: number }[],
) {
    try {
        const { supabase, userId, clinicId } = await getCtx();

        // ลบของเดิมก่อน
        await supabase.from("commission_splits").delete()
            .eq("clinic_id", clinicId).eq("inv_item_id", invItemId).eq("role", role);

        const valid = splits.filter(s => s.staff_id && s.percent > 0);
        if (valid.length === 0) {
            revalidatePath("/dashboard/commissions");
            return { success: true }; // เคลียร์การแบ่ง = กลับไป attribute ปกติ
        }
        const sum = valid.reduce((s, r) => s + Number(r.percent), 0);
        if (Math.abs(sum - 100) > 0.01) {
            return { success: false, error: `% รวมต้องเท่ากับ 100 (ตอนนี้ ${sum})` };
        }
        // กันคนซ้ำ
        const ids = new Set(valid.map(v => v.staff_id));
        if (ids.size !== valid.length) return { success: false, error: "มีพนักงานซ้ำ" };

        const { error } = await supabase.from("commission_splits").insert(
            valid.map(s => ({
                clinic_id: clinicId, inv_item_id: invItemId, role,
                staff_id: s.staff_id, percent: s.percent, created_by: userId,
            })),
        );
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/commissions");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
