"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { notifyOwners, notifyProfileIds } from "@/lib/line-notify";
import { revalidatePath } from "next/cache";

export type SchedulePeriodStatus = "draft" | "pending" | "approved";

export interface SchedulePeriod {
    period_month: string;
    status: SchedulePeriodStatus;
    shift_count: number;
    submitted_by: string | null;
    submitted_at: string | null;
    decided_by: string | null;
    decided_at: string | null;
    decision_note: string | null;
}

export interface ScheduleApprovalLogRow {
    id: string;
    action: string;
    actor_name: string | null;
    note: string | null;
    created_at: string;
}

async function ctx() {
    const supabase = await createClient();
    const { userId, clinicId, role } = await getEffectivePermissionsForUser();
    if (!userId || !clinicId) throw new Error("Unauthorized");
    return { supabase, userId, clinicId, role };
}

async function actorName(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    return (data?.full_name as string) || "";
}

/** สถานะของเดือน (ไม่มี record = draft) */
export async function getSchedulePeriod(month: string): Promise<SchedulePeriod> {
    const { supabase, clinicId } = await ctx();
    const { data } = await supabase
        .from("schedule_periods")
        .select("period_month, status, shift_count, submitted_by, submitted_at, decided_by, decided_at, decision_note")
        .eq("clinic_id", clinicId).eq("period_month", month).maybeSingle();
    if (!data) return { period_month: month, status: "draft", shift_count: 0, submitted_by: null, submitted_at: null, decided_by: null, decided_at: null, decision_note: null };
    return data as SchedulePeriod;
}

/** ประวัติการอนุมัติของเดือน */
export async function getScheduleApprovalLog(month: string): Promise<ScheduleApprovalLogRow[]> {
    const { supabase, clinicId } = await ctx();
    const { data } = await supabase
        .from("schedule_approval_log")
        .select("id, action, actor_name, note, created_at")
        .eq("clinic_id", clinicId).eq("period_month", month)
        .order("created_at", { ascending: false });
    return (data || []) as ScheduleApprovalLogRow[];
}

/** ส่งตารางเวรของเดือนไปขออนุมัติ (draft → pending) */
export async function submitScheduleForApproval(month: string) {
    const { supabase, userId, clinicId } = await ctx();
    const cur = await getSchedulePeriod(month);
    if (cur.status === "pending") return { success: false, error: "เดือนนี้อยู่ระหว่างรออนุมัติแล้ว" };
    if (cur.status === "approved") return { success: false, error: "เดือนนี้อนุมัติแล้ว — ต้อง reopen ก่อนส่งใหม่" };

    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const { count } = await supabase.from("doctor_shifts")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("shift_date", `${month}-01`).lte("shift_date", `${month}-${String(last).padStart(2, "0")}`);
    if (!count) return { success: false, error: "ยังไม่มีเวรในเดือนนี้ ส่งอนุมัติไม่ได้" };

    const name = await actorName(supabase, userId);
    const { error } = await supabase.from("schedule_periods").upsert({
        clinic_id: clinicId, period_month: month, status: "pending", shift_count: count,
        submitted_by: userId, submitted_at: new Date().toISOString(),
        decided_by: null, decided_at: null, decision_note: null, updated_at: new Date().toISOString(),
    }, { onConflict: "clinic_id,period_month" });
    if (error) return { success: false, error: error.message };

    await supabase.from("schedule_approval_log").insert({ clinic_id: clinicId, period_month: month, action: "submit", actor_id: userId, actor_name: name });
    // แจ้งเตือน owner ทาง LINE ว่ามีตารางเวรรออนุมัติ (best-effort)
    await notifyOwners(supabase, clinicId, `🗓️ มีตารางเวรเดือน ${month} รออนุมัติ (${count} เวร) จาก ${name || "พนักงาน"} — เปิดระบบเพื่ออนุมัติ`);
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true, count };
}

/** Owner อนุมัติ/ปฏิเสธ (pending → approved | draft) */
export async function decideSchedulePeriod(month: string, approve: boolean, note?: string) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (role !== "owner") return { success: false, error: "เฉพาะเจ้าของคลินิก (owner) อนุมัติได้" };
    const cur = await getSchedulePeriod(month);
    if (cur.status !== "pending") return { success: false, error: "เดือนนี้ไม่ได้อยู่สถานะรออนุมัติ" };

    const name = await actorName(supabase, userId);
    const { error } = await supabase.from("schedule_periods").update({
        status: approve ? "approved" : "draft",
        decided_by: userId, decided_at: new Date().toISOString(), decision_note: note || null, updated_at: new Date().toISOString(),
    }).eq("clinic_id", clinicId).eq("period_month", month);
    if (error) return { success: false, error: error.message };

    await supabase.from("schedule_approval_log").insert({ clinic_id: clinicId, period_month: month, action: approve ? "approve" : "reject", actor_id: userId, actor_name: name, note: note || null });
    // แจ้งเตือนผู้ส่ง (best-effort)
    if (cur.submitted_by) {
        await notifyProfileIds(supabase, [cur.submitted_by], approve
            ? `✅ ตารางเวรเดือน ${month} ได้รับการอนุมัติแล้ว`
            : `❌ ตารางเวรเดือน ${month} ถูกปฏิเสธ${note ? ` — เหตุผล: ${note}` : ""} กรุณาแก้ไขและส่งใหม่`);
    }
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true };
}

/** Owner เปิดตารางที่อนุมัติแล้วกลับมาแก้ (approved → draft) */
export async function reopenSchedulePeriod(month: string, note?: string) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (role !== "owner") return { success: false, error: "เฉพาะเจ้าของคลินิก (owner) เปิดแก้ได้" };
    const cur = await getSchedulePeriod(month);
    if (cur.status !== "approved") return { success: false, error: "เดือนนี้ยังไม่ได้อนุมัติ" };

    const name = await actorName(supabase, userId);
    const { error } = await supabase.from("schedule_periods").update({
        status: "draft", decided_by: userId, decided_at: new Date().toISOString(), decision_note: note || null, updated_at: new Date().toISOString(),
    }).eq("clinic_id", clinicId).eq("period_month", month);
    if (error) return { success: false, error: error.message };

    await supabase.from("schedule_approval_log").insert({ clinic_id: clinicId, period_month: month, action: "reopen", actor_id: userId, actor_name: name, note: note || null });
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true };
}
