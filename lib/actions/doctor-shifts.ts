"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate, bangkokTime } from "@/lib/utils/date";

export interface ScheduleStaff {
    id: string;        // staff.id
    name: string;
    role: string;
}

export interface ScheduleRoom {
    id: string;
    name: string;
}

export interface DoctorShift {
    id: string;
    doctor_staff_id: string;
    doctor_name: string;
    shift_date: string;
    start_time: string;   // "HH:MM"
    end_time: string;     // "HH:MM"
    room_id: string | null;
    room_name: string | null;
    branch_id: string | null;
    note: string | null;
}

export interface OnDutyDoctor {
    doctor_staff_id: string;
    doctor_name: string;
    shifts: { start_time: string; end_time: string; room_name: string | null }[];
    earliest: string;     // "HH:MM"
    latest: string;       // "HH:MM"
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** รายชื่อพนักงานทั้งหมด (active) พร้อม role — สำหรับลงเวร/ลงเวลาทุกตำแหน่ง */
export async function getScheduleStaff(): Promise<ScheduleStaff[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("staff")
        .select("id, profiles!inner(full_name, role)")
        .eq("is_active", true);
    return (data || []).map((d) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prof = Array.isArray((d as any).profiles) ? (d as any).profiles[0] : (d as any).profiles;
        return { id: d.id as string, name: (prof?.full_name as string) || "—", role: (prof?.role as string) || "" };
    });
}

/** เซตของ staff_id ที่เป็นแพทย์ (doctor/owner) */
async function getDoctorIdSet(): Promise<Set<string>> {
    const staff = await getScheduleStaff();
    return new Set(staff.filter((s) => s.role === "doctor" || s.role === "owner").map((s) => s.id));
}

/** รายชื่อห้องตรวจ (active) */
export async function getScheduleRooms(): Promise<ScheduleRoom[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("rooms")
        .select("id, room_name")
        .eq("is_active", true)
        .order("display_order");
    return (data || []).map((r) => ({ id: r.id as string, name: r.room_name as string }));
}

/** เวรทั้งหมดในวันที่กำหนด (เรียงตามเวลาเริ่ม) */
export async function getShiftsForDate(date: string): Promise<DoctorShift[]> {
    const supabase = await createClient();
    const { data: shifts } = await supabase
        .from("doctor_shifts")
        .select("id, doctor_staff_id, shift_date, start_time, end_time, room_id, branch_id, note")
        .eq("shift_date", date)
        .order("start_time", { ascending: true });

    if (!shifts || shifts.length === 0) return [];

    const [staffList, rooms] = await Promise.all([getScheduleStaff(), getScheduleRooms()]);
    const docMap = new Map(staffList.map((d) => [d.id, d.name]));
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

    return shifts.map((s) => ({
        id: s.id as string,
        doctor_staff_id: s.doctor_staff_id as string,
        doctor_name: docMap.get(s.doctor_staff_id as string) || "—",
        shift_date: s.shift_date as string,
        start_time: hhmm(s.start_time as string),
        end_time: hhmm(s.end_time as string),
        room_id: (s.room_id as string) || null,
        room_name: s.room_id ? roomMap.get(s.room_id as string) || null : null,
        branch_id: (s.branch_id as string) || null,
        note: (s.note as string) || null,
    }));
}

export interface MonthShift {
    id: string;
    doctor_staff_id: string;
    doctor_name: string;
    role: string;
    shift_date: string;
    start_time: string;   // "HH:MM"
    end_time: string;     // "HH:MM"
    room_name: string | null;
}

/** เวรทั้งเดือน (month = "YYYY-MM") — สำหรับมุมมองปฏิทินรายเดือน */
export async function getShiftsForMonth(month: string): Promise<MonthShift[]> {
    const supabase = await createClient();
    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${month}-${String(lastDay).padStart(2, "0")}`;

    const { data: rows } = await supabase
        .from("doctor_shifts")
        .select("id, doctor_staff_id, shift_date, start_time, end_time, room_id")
        .gte("shift_date", first).lte("shift_date", last)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true });
    if (!rows || rows.length === 0) return [];

    const [staffList, rooms] = await Promise.all([getScheduleStaff(), getScheduleRooms()]);
    const sMap = new Map(staffList.map((s) => [s.id, s]));
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

    return rows.map((s) => {
        const st = sMap.get(s.doctor_staff_id as string);
        return {
            id: s.id as string,
            doctor_staff_id: s.doctor_staff_id as string,
            doctor_name: st?.name || "—",
            role: st?.role || "",
            shift_date: s.shift_date as string,
            start_time: hhmm(s.start_time as string),
            end_time: hhmm(s.end_time as string),
            room_name: s.room_id ? roomMap.get(s.room_id as string) || null : null,
        };
    });
}

/** หมอที่เข้าเวรในวันที่กำหนด (รวมช่วงเวลา) — ใช้กับ widget + กรองหน้านัด */
export async function getOnDutyDoctors(date: string): Promise<OnDutyDoctor[]> {
    const [shifts, doctorIds] = await Promise.all([getShiftsForDate(date), getDoctorIdSet()]);
    const byDoctor = new Map<string, OnDutyDoctor>();
    for (const s of shifts) {
        if (!doctorIds.has(s.doctor_staff_id)) continue;   // เฉพาะแพทย์
        let entry = byDoctor.get(s.doctor_staff_id);
        if (!entry) {
            entry = {
                doctor_staff_id: s.doctor_staff_id,
                doctor_name: s.doctor_name,
                shifts: [],
                earliest: s.start_time,
                latest: s.end_time,
            };
            byDoctor.set(s.doctor_staff_id, entry);
        }
        entry.shifts.push({ start_time: s.start_time, end_time: s.end_time, room_name: s.room_name });
        if (s.start_time < entry.earliest) entry.earliest = s.start_time;
        if (s.end_time > entry.latest) entry.latest = s.end_time;
    }
    return Array.from(byDoctor.values());
}

/** แพทย์ที่ "เข้าเวรอยู่ตอนนี้" แต่ยังไม่ได้ check-in ห้อง (เทียบ room_doctor_sessions) */
export async function getDoctorsNotCheckedIn(): Promise<string[]> {
    const supabase = await createClient();
    const today = bangkokDate();
    const nowHM = bangkokTime().slice(0, 5);

    const [shifts, doctorIds] = await Promise.all([getShiftsForDate(today), getDoctorIdSet()]);
    const onNow = shifts.filter((s) => doctorIds.has(s.doctor_staff_id) && s.start_time <= nowHM && nowHM <= s.end_time);
    if (onNow.length === 0) return [];

    const { data: sessions } = await supabase
        .from("room_doctor_sessions")
        .select("doctor_staff_id")
        .is("checked_out_at", null);
    const checkedIn = new Set((sessions || []).map((s) => s.doctor_staff_id as string));

    return [...new Set(onNow.filter((s) => !checkedIn.has(s.doctor_staff_id)).map((s) => s.doctor_name))];
}

export async function addShift(input: {
    doctor_staff_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    room_id?: string | null;
    branch_id?: string | null;
    note?: string | null;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    if (input.end_time <= input.start_time) throw new Error("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");

    const { error } = await supabase.from("doctor_shifts").insert({
        clinic_id: profile.clinic_id,
        doctor_staff_id: input.doctor_staff_id,
        shift_date: input.shift_date,
        start_time: input.start_time,
        end_time: input.end_time,
        room_id: input.room_id || null,
        branch_id: input.branch_id || null,
        note: input.note || null,
        created_by: user.id,
    });
    if (error) throw error;

    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true };
}

/** เพิ่มเวรหลายวันรวดเดียว (เวลา/ห้องเดียวกัน) */
export async function addShiftBulk(input: {
    doctor_staff_id: string;
    dates: string[];
    start_time: string;
    end_time: string;
    room_id?: string | null;
    note?: string | null;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");
    if (input.end_time <= input.start_time) throw new Error("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
    if (!input.dates.length) throw new Error("ยังไม่ได้เลือกวัน");

    const rows = input.dates.map((d) => ({
        clinic_id: profile.clinic_id,
        doctor_staff_id: input.doctor_staff_id,
        shift_date: d,
        start_time: input.start_time,
        end_time: input.end_time,
        room_id: input.room_id || null,
        note: input.note || null,
        created_by: user.id,
    }));
    const { error } = await supabase.from("doctor_shifts").insert(rows);
    if (error) throw error;

    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true, count: rows.length };
}

export async function updateShift(id: string, input: {
    start_time: string;
    end_time: string;
    room_id?: string | null;
    note?: string | null;
}) {
    const supabase = await createClient();
    if (input.end_time <= input.start_time) throw new Error("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
    const { error } = await supabase.from("doctor_shifts").update({
        start_time: input.start_time,
        end_time: input.end_time,
        room_id: input.room_id || null,
        note: input.note || null,
    }).eq("id", id);
    if (error) throw error;
    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true };
}

/** ลบเวรทั้งหมดในชุดวันที่กำหนด (โหมดเลือกหลายวัน) */
export async function deleteShiftsForDates(dates: string[]) {
    const supabase = await createClient();
    if (!dates.length) return { success: true, count: 0 };
    const { data, error } = await supabase
        .from("doctor_shifts")
        .delete()
        .in("shift_date", dates)
        .select("id");
    if (error) throw error;
    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true, count: data?.length ?? 0 };
}

export async function deleteShift(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from("doctor_shifts").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true };
}

/** คัดลอกเวรทั้งวันจากวันต้นทางไปวันปลายทาง (ช่วยลดงานลงเวรรายวัน) */
export async function copyShifts(fromDate: string, toDate: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    const { data: src } = await supabase
        .from("doctor_shifts")
        .select("doctor_staff_id, start_time, end_time, room_id, branch_id, note")
        .eq("shift_date", fromDate);

    if (!src || src.length === 0) return { success: true, copied: 0 };

    const rows = src.map((s) => ({
        clinic_id: profile.clinic_id,
        doctor_staff_id: s.doctor_staff_id,
        shift_date: toDate,
        start_time: s.start_time,
        end_time: s.end_time,
        room_id: s.room_id || null,
        branch_id: s.branch_id || null,
        note: s.note || null,
        created_by: user.id,
    }));
    const { error } = await supabase.from("doctor_shifts").insert(rows);
    if (error) throw error;

    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true, copied: rows.length };
}
