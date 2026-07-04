"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { getScheduleStaff } from "@/lib/actions/doctor-shifts";
import { revalidatePath } from "next/cache";

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

export interface SwapShiftOption {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    room_name: string | null;
}

export interface SwapRequestRow {
    id: string;
    shift_id: string | null;
    shift_date: string;
    from_staff_id: string;
    from_name: string;
    to_staff_id: string;
    to_name: string;
    reason: string | null;
    status: string;
    decision_note: string | null;
    decided_at: string | null;
    created_at: string;
}

async function ctx() {
    const supabase = await createClient();
    const { userId, clinicId, role } = await getEffectivePermissionsForUser();
    if (!userId || !clinicId) throw new Error("Unauthorized");
    return { supabase, userId, clinicId, role };
}

/** เวรในอนาคต (ตั้งแต่วันนี้) ของพนักงานคนหนึ่ง — ให้เลือกตอนสร้างคำขอ */
export async function getUpcomingShiftsForStaff(staffId: string): Promise<SwapShiftOption[]> {
    const { supabase } = await ctx();
    if (!staffId) return [];
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
        .from("doctor_shifts")
        .select("id, shift_date, start_time, end_time, room_id")
        .eq("doctor_staff_id", staffId)
        .gte("shift_date", today)
        .order("shift_date", { ascending: true }).order("start_time", { ascending: true });
    if (!data || data.length === 0) return [];
    const { data: rooms } = await supabase.from("rooms").select("id, room_name");
    const roomMap = new Map((rooms || []).map((r) => [r.id as string, r.room_name as string]));
    return data.map((s) => ({
        id: s.id as string,
        shift_date: s.shift_date as string,
        start_time: hhmm(s.start_time as string),
        end_time: hhmm(s.end_time as string),
        room_name: s.room_id ? roomMap.get(s.room_id as string) || null : null,
    }));
}

/** สร้างคำขอเปลี่ยนเวร */
export async function createSwapRequest(input: { shift_id: string; to_staff_id: string; reason?: string }) {
    const { supabase, userId, clinicId } = await ctx();
    const { data: shift } = await supabase
        .from("doctor_shifts")
        .select("id, doctor_staff_id, shift_date")
        .eq("id", input.shift_id).eq("clinic_id", clinicId).maybeSingle();
    if (!shift) return { success: false, error: "ไม่พบเวรที่เลือก" };
    if (shift.doctor_staff_id === input.to_staff_id) return { success: false, error: "ผู้รับเวรต้องไม่ใช่คนเดิม" };

    const { error } = await supabase.from("shift_swap_requests").insert({
        clinic_id: clinicId,
        shift_id: shift.id,
        shift_date: shift.shift_date,
        from_staff_id: shift.doctor_staff_id,
        to_staff_id: input.to_staff_id,
        reason: input.reason || null,
        requested_by: userId,
        status: "pending",
    });
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true };
}

/** รายการคำขอเปลี่ยนเวร (ทั้งหมด — pending อยู่บนสุด) พร้อมชื่อ */
export async function getSwapRequests(): Promise<SwapRequestRow[]> {
    const { supabase, clinicId } = await ctx();
    const [{ data }, staff] = await Promise.all([
        supabase.from("shift_swap_requests")
            .select("id, shift_id, shift_date, from_staff_id, to_staff_id, reason, status, decision_note, decided_at, created_at")
            .eq("clinic_id", clinicId)
            .order("created_at", { ascending: false }).limit(200),
        getScheduleStaff(),
    ]);
    const nameMap = new Map(staff.map((s) => [s.id, s.name]));
    return (data || []).map((r) => ({
        id: r.id as string,
        shift_id: (r.shift_id as string) || null,
        shift_date: r.shift_date as string,
        from_staff_id: r.from_staff_id as string,
        from_name: nameMap.get(r.from_staff_id as string) || "—",
        to_staff_id: r.to_staff_id as string,
        to_name: nameMap.get(r.to_staff_id as string) || "—",
        reason: (r.reason as string) || null,
        status: r.status as string,
        decision_note: (r.decision_note as string) || null,
        decided_at: (r.decided_at as string) || null,
        created_at: r.created_at as string,
    }));
}

/** อนุมัติ (ย้ายเวรไปคนใหม่) / ปฏิเสธ คำขอเปลี่ยนเวร — admin/owner */
export async function decideSwapRequest(id: string, approve: boolean, note?: string) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะแอดมิน/เจ้าของอนุมัติได้" };

    const { data: req } = await supabase.from("shift_swap_requests")
        .select("shift_id, to_staff_id, shift_date, status").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    if (!req) return { success: false, error: "ไม่พบคำขอ" };
    if (req.status !== "pending") return { success: false, error: "คำขอนี้ตัดสินใจไปแล้ว" };

    if (approve) {
        if (!req.shift_id) return { success: false, error: "เวรถูกลบไปแล้ว อนุมัติไม่ได้" };
        // กันเดือนที่ล็อค
        const month = (req.shift_date as string).slice(0, 7);
        const { data: period } = await supabase.from("schedule_periods").select("status").eq("clinic_id", clinicId).eq("period_month", month).maybeSingle();
        if (period && (period.status === "pending" || period.status === "approved")) {
            return { success: false, error: `ตารางเวรเดือน ${month} ถูกล็อค — เปิดแก้ (reopen) ก่อน` };
        }
        // เช็คเวลาทับซ้อนของผู้รับเวรในวันนั้น
        const { data: shift } = await supabase.from("doctor_shifts").select("start_time, end_time").eq("id", req.shift_id).maybeSingle();
        if (shift) {
            const { data: exist } = await supabase.from("doctor_shifts")
                .select("start_time, end_time").eq("doctor_staff_id", req.to_staff_id).eq("shift_date", req.shift_date);
            const s = hhmm(shift.start_time as string), e = hhmm(shift.end_time as string);
            const clash = (exist || []).some((x) => s < hhmm(x.end_time as string) && e > hhmm(x.start_time as string));
            if (clash) return { success: false, error: "ผู้รับเวรมีเวรทับซ้อนในวันนั้นแล้ว" };
        }
        const { error: upErr } = await supabase.from("doctor_shifts").update({ doctor_staff_id: req.to_staff_id }).eq("id", req.shift_id);
        if (upErr) return { success: false, error: upErr.message };
    }

    const { error } = await supabase.from("shift_swap_requests").update({
        status: approve ? "approved" : "rejected",
        decided_by: userId, decided_at: new Date().toISOString(), decision_note: note || null,
    }).eq("id", id).eq("clinic_id", clinicId);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true };
}

/** ยกเลิกคำขอ (ผู้ขอ/แอดมิน) */
export async function cancelSwapRequest(id: string) {
    const { supabase, clinicId } = await ctx();
    const { error } = await supabase.from("shift_swap_requests")
        .update({ status: "cancelled" }).eq("id", id).eq("clinic_id", clinicId).eq("status", "pending");
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true };
}
