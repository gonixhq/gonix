"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { getScheduleStaff, getScheduleRooms } from "@/lib/actions/doctor-shifts";
import { notifyStaffIds } from "@/lib/line-notify";
import { revalidatePath } from "next/cache";

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

export interface DefaultSlot {
    weekday: number;      // 0=อา … 6=ส (JS getDay)
    start_time: string;   // "HH:MM"
    end_time: string;     // "HH:MM"
    room_id: string | null;
}
export interface DefaultScheduleStaff {
    staff_id: string;
    name: string;
    role: string;
    updated_at: string | null;
    updated_by_name: string | null;
    slots: (DefaultSlot & { room_name: string | null })[];
}
export interface ApplyPreview {
    added: number;
    skipped: number;
    skippedDates: string[];
    perStaff: { staff_id: string; name: string; added: number; skipped: number }[];
}

async function ctx() {
    const supabase = await createClient();
    const { userId, clinicId, role } = await getEffectivePermissionsForUser();
    if (!userId || !clinicId) throw new Error("Unauthorized");
    return { supabase, userId, clinicId, role };
}

/** วันที่ทั้งหมดในเดือนที่ตรงกับ weekday ที่กำหนด (YYYY-MM-DD) */
function datesInMonthForWeekdays(month: string, weekdays: Set<number>): { date: string; weekday: number }[] {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const out: { date: string; weekday: number }[] = [];
    for (let d = 1; d <= last; d++) {
        const dt = new Date(y, m - 1, d);
        const wd = dt.getDay();
        if (weekdays.has(wd)) out.push({ date: `${month}-${String(d).padStart(2, "0")}`, weekday: wd });
    }
    return out;
}

/** เวรมาตรฐานของทุกคน (เฉพาะคนที่ตั้งไว้) */
export async function getDefaultSchedule(): Promise<DefaultScheduleStaff[]> {
    const { supabase, clinicId } = await ctx();
    const [{ data: rows }, staff, rooms] = await Promise.all([
        supabase.from("staff_default_schedule")
            .select("staff_id, weekday, start_time, end_time, room_id, updated_at, updated_by")
            .eq("clinic_id", clinicId)
            .order("weekday", { ascending: true }).order("start_time", { ascending: true }),
        getScheduleStaff(),
        getScheduleRooms(),
    ]);
    if (!rows || rows.length === 0) return [];
    const staffMap = new Map(staff.map((s) => [s.id, s]));
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

    // ชื่อผู้แก้ล่าสุด
    const editorIds = [...new Set(rows.map((r) => r.updated_by as string).filter(Boolean))];
    const editorMap = new Map<string, string>();
    if (editorIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", editorIds);
        for (const p of profs || []) editorMap.set(p.id as string, (p.full_name as string) || "");
    }

    const byStaff = new Map<string, DefaultScheduleStaff>();
    for (const r of rows) {
        const sid = r.staff_id as string;
        let e = byStaff.get(sid);
        if (!e) {
            const st = staffMap.get(sid);
            e = { staff_id: sid, name: st?.name || "—", role: st?.role || "", updated_at: null, updated_by_name: null, slots: [] };
            byStaff.set(sid, e);
        }
        e.slots.push({
            weekday: r.weekday as number,
            start_time: hhmm(r.start_time as string),
            end_time: hhmm(r.end_time as string),
            room_id: (r.room_id as string) || null,
            room_name: r.room_id ? roomMap.get(r.room_id as string) || null : null,
        });
        const u = r.updated_at as string;
        if (u && (!e.updated_at || u > e.updated_at)) { e.updated_at = u; e.updated_by_name = editorMap.get(r.updated_by as string) || null; }
    }
    return [...byStaff.values()];
}

/** ตั้ง/แทนที่เวรมาตรฐานของพนักงานคนหนึ่ง (แทนทั้งชุด) */
export async function setStaffDefaultSchedule(staffId: string, slots: DefaultSlot[]) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะแอดมิน/เจ้าของแก้ได้" };
    if (!staffId) return { success: false, error: "ยังไม่ได้เลือกพนักงาน" };
    for (const s of slots) {
        if (!s.start_time || !s.end_time || s.end_time <= s.start_time) return { success: false, error: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" };
        if (s.weekday < 0 || s.weekday > 6) return { success: false, error: "วันไม่ถูกต้อง" };
    }
    await supabase.from("staff_default_schedule").delete().eq("clinic_id", clinicId).eq("staff_id", staffId);
    if (slots.length > 0) {
        const { error } = await supabase.from("staff_default_schedule").insert(
            slots.map((s) => ({
                clinic_id: clinicId, staff_id: staffId, weekday: s.weekday,
                start_time: s.start_time, end_time: s.end_time, room_id: s.room_id || null,
                updated_by: userId, updated_at: new Date().toISOString(),
            }))
        );
        if (error) return { success: false, error: error.message };
    }
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true };
}

/** ลบเวรมาตรฐานของพนักงานคนหนึ่ง */
export async function clearStaffDefaultSchedule(staffId: string) {
    const { supabase, clinicId, role } = await ctx();
    if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะแอดมิน/เจ้าของลบได้" };
    const { error } = await supabase.from("staff_default_schedule").delete().eq("clinic_id", clinicId).eq("staff_id", staffId);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/doctor-schedule");
    return { success: true };
}

/** ตรวจว่าเดือนถูกล็อค (approval) หรือไม่ */
async function isMonthLocked(supabase: Awaited<ReturnType<typeof createClient>>, clinicId: string, month: string): Promise<boolean> {
    const { data } = await supabase.from("schedule_periods").select("status").eq("clinic_id", clinicId).eq("period_month", month).maybeSingle();
    return !!data && (data.status === "pending" || data.status === "approved");
}

/** คำนวณเวรที่จะเพิ่ม/ข้าม เมื่อ apply (ไม่บันทึกจริง) */
export async function previewApplyDefault(month: string, staffId?: string): Promise<ApplyPreview> {
    const { supabase, clinicId } = await ctx();
    const built = await buildApplyRows(supabase, clinicId, month, staffId);
    return built.preview;
}

/** สร้างแถวเวรจาก default (คำนวณ conflict) — ใช้ทั้ง preview + apply */
async function buildApplyRows(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any, clinicId: string, month: string, staffId?: string,
) {
    let q = supabase.from("staff_default_schedule")
        .select("staff_id, weekday, start_time, end_time, room_id").eq("clinic_id", clinicId);
    if (staffId) q = q.eq("staff_id", staffId);
    const { data: defs } = await q;
    const staff = await getScheduleStaff();
    const nameMap = new Map(staff.map((s) => [s.id, s.name]));

    // เวรเดิมในเดือน (เฉพาะ staff ที่เกี่ยว)
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const staffIds = [...new Set((defs || []).map((d: any) => d.staff_id as string))];
    const existByStaffDate: Record<string, { s: string; e: string }[]> = {};
    if (staffIds.length > 0) {
        const { data: existing } = await supabase.from("doctor_shifts")
            .select("doctor_staff_id, shift_date, start_time, end_time")
            .gte("shift_date", `${month}-01`).lte("shift_date", `${month}-${String(last).padStart(2, "0")}`)
            .in("doctor_staff_id", staffIds);
        for (const e of existing || []) {
            const k = `${e.doctor_staff_id}|${e.shift_date}`;
            (existByStaffDate[k] ||= []).push({ s: hhmm(e.start_time as string), e: hhmm(e.end_time as string) });
        }
    }

    const rows: { staff_id: string; date: string; start: string; end: string; room_id: string | null }[] = [];
    const skippedDates: string[] = [];
    const perStaffMap = new Map<string, { added: number; skipped: number }>();
    // กันซ้ำภายในรอบเดียว (หลาย slot ชนกันเอง)
    const plannedKey = new Set<string>();

    for (const d of defs || []) {
        const sid = d.staff_id as string;
        const start = hhmm(d.start_time as string), end = hhmm(d.end_time as string);
        const dates = datesInMonthForWeekdays(month, new Set([d.weekday as number]));
        for (const { date } of dates) {
            const ps = perStaffMap.get(sid) || { added: 0, skipped: 0 };
            const key = `${sid}|${date}|${start}|${end}`;
            const existing = existByStaffDate[`${sid}|${date}`] || [];
            const clashExisting = existing.some((x) => start < x.e && end > x.s);
            const clashPlanned = [...plannedKey].some((pk) => {
                const [pSid, pDate, pS, pE] = pk.split("|");
                return pSid === sid && pDate === date && start < pE && end > pS;
            });
            if (clashExisting || clashPlanned) {
                ps.skipped++; skippedDates.push(date);
            } else {
                rows.push({ staff_id: sid, date, start, end, room_id: (d.room_id as string) || null });
                plannedKey.add(key); ps.added++;
            }
            perStaffMap.set(sid, ps);
        }
    }

    const preview: ApplyPreview = {
        added: rows.length,
        skipped: skippedDates.length,
        skippedDates: [...new Set(skippedDates)].sort(),
        perStaff: [...perStaffMap.entries()].map(([sid, v]) => ({ staff_id: sid, name: nameMap.get(sid) || "—", added: v.added, skipped: v.skipped })),
    };
    return { rows, preview };
}

/** apply เวรมาตรฐานเข้าเดือน (รายคน หรือทั้งหมดถ้าไม่ระบุ staffId) */
export async function applyDefaultSchedule(month: string, staffId?: string) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะแอดมิน/เจ้าของ apply ได้" };
    if (await isMonthLocked(supabase, clinicId, month)) return { success: false, error: `ตารางเวรเดือน ${month} ถูกล็อค` };

    const { rows } = await buildApplyRows(supabase, clinicId, month, staffId);
    if (rows.length === 0) return { success: true, added: 0, skipped: 0 };

    const { error } = await supabase.from("doctor_shifts").insert(
        rows.map((r) => ({
            clinic_id: clinicId, doctor_staff_id: r.staff_id, shift_date: r.date,
            start_time: r.start, end_time: r.end, room_id: r.room_id, source: "recurring", created_by: userId,
        }))
    );
    if (error) return { success: false, error: error.message };

    // แจ้งเตือนพนักงานทาง LINE (best-effort) — นับต่อคน
    const perStaff = new Map<string, number>();
    for (const r of rows) perStaff.set(r.staff_id, (perStaff.get(r.staff_id) || 0) + 1);
    for (const [sid, n] of perStaff) {
        await notifyStaffIds(supabase, [sid], `📅 ตารางเวรเดือน ${month} ของคุณถูกจัดแล้ว ${n} เวร (เวรประจำ) — ตรวจสอบได้ในระบบ`);
    }

    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true, added: rows.length };
}

/** ลบเวรของพนักงานคนหนึ่งทั้งเดือน (ลบเวรซ้ำทั้งชุดในทีเดียว) */
export async function deleteShiftsForStaffMonth(staffId: string, month: string, onlyRecurring = false) {
    const { supabase, clinicId, role } = await ctx();
    if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะแอดมิน/เจ้าของลบได้" };
    if (await isMonthLocked(supabase, clinicId, month)) return { success: false, error: `ตารางเวรเดือน ${month} ถูกล็อค` };
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    let q = supabase.from("doctor_shifts").delete()
        .eq("clinic_id", clinicId).eq("doctor_staff_id", staffId)
        .gte("shift_date", `${month}-01`).lte("shift_date", `${month}-${String(last).padStart(2, "0")}`);
    if (onlyRecurring) q = q.eq("source", "recurring");
    const { data, error } = await q.select("id");
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/doctor-schedule");
    revalidatePath("/dashboard/overview");
    return { success: true, count: data?.length ?? 0 };
}
