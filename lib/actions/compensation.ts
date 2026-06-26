"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import { getCommissionsByPeriod } from "./commissions";
import { getShiftsForDate, getScheduleStaff } from "./doctor-shifts";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Profile/clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const round2 = (n: number) => Math.round(n * 100) / 100;

// อัตราหักมาตรฐาน (ไทย)
const WHT_RATE = 0.03;       // หัก ณ ที่จ่าย 3%
const SSO_RATE = 0.05;       // ประกันสังคม 5%
const SSO_CAP = 750;         // เพดานหัก ปกส. ต่อเดือน

export interface CompRow {
    staff_id: string;
    name: string;
    role: string;
    pay_type: string;       // 'hourly' | 'monthly'
    hourly_rate: number;
    monthly_salary: number;
    planned_hours: number;
    actual_hours: number;
    has_actual: boolean;
    absent_days: number;    // วันที่ลงเวรแต่ไม่มีตอกบัตร (ไว้ให้แอดมินดูก่อนปรับยอด)
    pay_hours: number;      // ชั่วโมงที่ใช้คิดเงิน (จริงถ้ามี ไม่งั้นใช้แผน)
    time_pay: number;       // ค่าจ้างฐาน: รายชม. = pay_hours × rate ; เงินเดือน = monthly_salary
    df: number;             // ค่า DF/commission เดือนนั้น (เฉพาะที่อนุมัติแล้ว)
    df_pending: number;     // DF ที่ยังไม่อนุมัติ (ไม่นับเข้ายอดจ่าย)
    total: number;          // time_pay + df (ก่อนหัก)
    wht_enabled: boolean;
    sso_enabled: boolean;
    wht: number;            // หัก ณ ที่จ่าย
    sso: number;            // ประกันสังคม
    other_deduction: number; // หักอื่นๆ (มาสาย/ลา/ขาด) — จาก snapshot ถ้าจ่ายแล้ว
    net: number;            // ยอดสุทธิที่ต้องโอนจริง
    is_paid: boolean;       // ปิดยอด/จ่ายแล้วหรือยัง
    paid_at: string | null;
}

/** สรุปค่าตอบแทนพนักงานทั้งหมดในเดือน (month = "YYYY-MM") */
export async function getStaffCompensation(month: string): Promise<CompRow[]> {
    const { supabase, clinicId } = await getCtx();
    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${month}-${String(lastDay).padStart(2, "0")}`;

    // staff + เรท/เงินเดือน + ชื่อ
    const { data: staffRows } = await supabase
        .from("staff")
        .select("id, hourly_rate, pay_type, monthly_salary, wht_enabled, sso_enabled, profiles!inner(full_name, role)")
        .eq("is_active", true);

    // ชั่วโมงตามแผน (doctor_shifts)
    const { data: shifts } = await supabase
        .from("doctor_shifts")
        .select("doctor_staff_id, shift_date, start_time, end_time")
        .gte("shift_date", first).lte("shift_date", last);

    const plannedMin = new Map<string, number>();
    const plannedDates = new Map<string, Set<string>>();
    (shifts || []).forEach((s) => {
        const sid = s.doctor_staff_id as string;
        const dur = toMin((s.end_time as string).slice(0, 5)) - toMin((s.start_time as string).slice(0, 5));
        if (dur > 0) plannedMin.set(sid, (plannedMin.get(sid) || 0) + dur);
        let set = plannedDates.get(sid); if (!set) { set = new Set(); plannedDates.set(sid, set); }
        set.add(s.shift_date as string);
    });

    // ชั่วโมงจริง (staff_time_logs ที่ปิดงานแล้ว)
    const { data: logs } = await supabase
        .from("staff_time_logs")
        .select("staff_id, work_date, clock_in, clock_out")
        .gte("work_date", first).lte("work_date", last)
        .not("clock_out", "is", null);

    const actualHrs = new Map<string, number>();
    const workedDates = new Map<string, Set<string>>();
    (logs || []).forEach((l) => {
        const sid = l.staff_id as string;
        const hrs = (new Date(l.clock_out as string).getTime() - new Date(l.clock_in as string).getTime()) / 3600000;
        if (hrs > 0) actualHrs.set(sid, (actualHrs.get(sid) || 0) + hrs);
        let set = workedDates.get(sid); if (!set) { set = new Set(); workedDates.set(sid, set); }
        set.add(l.work_date as string);
    });

    // DF/commission เดือนนั้น (reuse commissions) — ดึงเฉพาะ "ที่อนุมัติแล้ว" เข้ายอดจ่าย
    const dfSummary = await getCommissionsByPeriod(first);
    const dfMap = new Map<string, number>();        // อนุมัติแล้ว
    const dfPendingMap = new Map<string, number>(); // ยังไม่อนุมัติ
    dfSummary.forEach((d) => {
        if (d.is_approved) dfMap.set(d.staff_id, (dfMap.get(d.staff_id) || 0) + d.total_amount);
        else dfPendingMap.set(d.staff_id, (dfPendingMap.get(d.staff_id) || 0) + d.total_amount);
    });

    // สถานะปิดยอด/จ่ายแล้ว + snapshot รายการหัก
    const { data: payouts } = await supabase
        .from("compensation_payouts")
        .select("staff_id, paid_at, wht_amount, sso_amount, other_deduction, net_amount")
        .eq("period_month", first);
    const paidMap = new Map<string, { paid_at: string; wht: number; sso: number; other: number; net: number }>();
    (payouts || []).forEach((p) => paidMap.set(p.staff_id as string, {
        paid_at: p.paid_at as string,
        wht: Number(p.wht_amount || 0), sso: Number(p.sso_amount || 0),
        other: Number(p.other_deduction || 0), net: Number(p.net_amount || 0),
    }));

    const rows: CompRow[] = (staffRows || []).map((s) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prof = Array.isArray((s as any).profiles) ? (s as any).profiles[0] : (s as any).profiles;
        const id = s.id as string;
        const rate = Number(s.hourly_rate || 0);
        const payType = (s.pay_type as string) || "hourly";
        const salary = Number(s.monthly_salary || 0);
        const planned = round2((plannedMin.get(id) || 0) / 60);
        const actual = round2(actualHrs.get(id) || 0);
        const hasActual = actualHrs.has(id);
        const payHours = hasActual ? actual : planned;
        const timePay = payType === "monthly" ? round2(salary) : round2(payHours * rate);
        const df = round2(dfMap.get(id) || 0);
        const dfPending = round2(dfPendingMap.get(id) || 0);
        const pDates = plannedDates.get(id);
        const wDates = workedDates.get(id);
        let absentDays = 0;
        if (pDates) pDates.forEach((d) => { if (!wDates || !wDates.has(d)) absentDays++; });

        const total = round2(timePay + df);
        const whtEnabled = !!(s as { wht_enabled?: boolean }).wht_enabled;
        const ssoEnabled = !!(s as { sso_enabled?: boolean }).sso_enabled;
        const paid = paidMap.get(id);
        // จ่ายแล้ว → ใช้ snapshot ; ยังไม่จ่าย → คำนวณสด
        const wht = paid ? paid.wht : (whtEnabled ? round2(total * WHT_RATE) : 0);
        const sso = paid ? paid.sso : (ssoEnabled ? Math.min(round2(timePay * SSO_RATE), SSO_CAP) : 0);
        const other = paid ? paid.other : 0;
        const net = paid ? paid.net : round2(total - wht - sso - other);

        return {
            staff_id: id,
            name: (prof?.full_name as string) || "—",
            role: (prof?.role as string) || "",
            pay_type: payType,
            hourly_rate: rate,
            monthly_salary: salary,
            planned_hours: planned,
            actual_hours: actual,
            has_actual: hasActual,
            absent_days: absentDays,
            pay_hours: payHours,
            time_pay: timePay,
            df,
            df_pending: dfPending,
            total,
            wht_enabled: whtEnabled,
            sso_enabled: ssoEnabled,
            wht,
            sso,
            other_deduction: other,
            net,
            is_paid: paidMap.has(id),
            paid_at: paid?.paid_at || null,
        };
    });

    // เรียง: คนที่มียอดรวมมากก่อน
    return rows.sort((a, b) => b.total - a.total);
}

/** ตั้งค่าจ้างพนักงาน — ประเภท (รายชม./เงินเดือน) + อัตรา */
export async function setStaffPay(staffId: string, patch: { pay_type?: string; hourly_rate?: number; monthly_salary?: number; wht_enabled?: boolean; sso_enabled?: boolean }) {
    const { supabase } = await getCtx();
    const update: Record<string, unknown> = {};
    if (patch.pay_type !== undefined) update.pay_type = patch.pay_type;
    if (patch.hourly_rate !== undefined) update.hourly_rate = patch.hourly_rate;
    if (patch.monthly_salary !== undefined) update.monthly_salary = patch.monthly_salary;
    if (patch.wht_enabled !== undefined) update.wht_enabled = patch.wht_enabled;
    if (patch.sso_enabled !== undefined) update.sso_enabled = patch.sso_enabled;
    if (Object.keys(update).length === 0) return { success: true };
    const { error } = await supabase.from("staff").update(update).eq("id", staffId);
    if (error) throw error;
    revalidatePath("/dashboard/compensation");
    return { success: true };
}

export interface MyTimeStatus {
    hasStaff: boolean;
    open: { id: string; clock_in: string } | null;
}

/** สถานะตอกบัตรของผู้ใช้ปัจจุบัน */
export async function getMyTimeStatus(): Promise<MyTimeStatus> {
    const { supabase, userId } = await getCtx();
    const { data: st } = await supabase.from("staff").select("id").eq("profile_id", userId).maybeSingle();
    if (!st) return { hasStaff: false, open: null };
    const { data: open } = await supabase
        .from("staff_time_logs")
        .select("id, clock_in")
        .eq("staff_id", st.id).is("clock_out", null)
        .maybeSingle();
    return { hasStaff: true, open: open ? { id: open.id as string, clock_in: open.clock_in as string } : null };
}

/** ตอกบัตรเข้างาน (ผู้ใช้ปัจจุบัน) */
export async function clockIn() {
    const { supabase, userId, clinicId } = await getCtx();
    const { data: st } = await supabase.from("staff").select("id").eq("profile_id", userId).maybeSingle();
    if (!st) throw new Error("บัญชีนี้ไม่ผูกกับข้อมูลพนักงาน");
    const { data: open } = await supabase.from("staff_time_logs").select("id").eq("staff_id", st.id).is("clock_out", null).maybeSingle();
    if (open) return { success: true, alreadyOpen: true };
    const now = new Date();
    const { error } = await supabase.from("staff_time_logs").insert({
        clinic_id: clinicId, staff_id: st.id, work_date: bangkokDate(now),
        clock_in: now.toISOString(), source: "clock", created_by: userId,
    });
    if (error) throw error;
    revalidatePath("/dashboard/compensation");
    return { success: true };
}

/** ตอกบัตรออกงาน (ผู้ใช้ปัจจุบัน) */
export async function clockOut() {
    const { supabase, userId } = await getCtx();
    const { data: st } = await supabase.from("staff").select("id").eq("profile_id", userId).maybeSingle();
    if (!st) throw new Error("บัญชีนี้ไม่ผูกกับข้อมูลพนักงาน");
    const { error } = await supabase.from("staff_time_logs")
        .update({ clock_out: new Date().toISOString() })
        .eq("staff_id", st.id).is("clock_out", null);
    if (error) throw error;
    revalidatePath("/dashboard/compensation");
    return { success: true };
}

export interface TimeLogRow {
    id: string;
    staff_id: string;
    staff_name: string;
    clock_in: string;
    clock_out: string | null;
    hours: number | null;
    source: string;
}

/** บันทึกเวลาในวันที่กำหนด (สำหรับแอดมินตรวจสอบ) */
export async function getTimeLogsForDate(date: string): Promise<TimeLogRow[]> {
    const { supabase } = await getCtx();
    const { data: logs } = await supabase
        .from("staff_time_logs")
        .select("id, staff_id, clock_in, clock_out, source")
        .eq("work_date", date)
        .order("clock_in", { ascending: true });
    if (!logs || logs.length === 0) return [];

    const { data: staffRows } = await supabase.from("staff").select("id, profiles!inner(full_name)");
    const nameMap = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (staffRows || []).forEach((s: any) => {
        const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
        nameMap.set(s.id, p?.full_name || "—");
    });

    return logs.map((l) => {
        const hrs = l.clock_out
            ? Math.round(((new Date(l.clock_out as string).getTime() - new Date(l.clock_in as string).getTime()) / 3600000) * 100) / 100
            : null;
        return {
            id: l.id as string,
            staff_id: l.staff_id as string,
            staff_name: nameMap.get(l.staff_id as string) || "—",
            clock_in: l.clock_in as string,
            clock_out: (l.clock_out as string) || null,
            hours: hrs,
            source: (l.source as string) || "manual",
        };
    });
}

/** แอดมินกรอกเวลาจริงให้พนักงาน (work_date + เวลาเข้า/ออก เป็นเวลาไทย) */
export async function addManualTimeLog(input: {
    staff_id: string;
    work_date: string;
    start_time: string;   // "HH:MM"
    end_time: string;     // "HH:MM"
    note?: string | null;
}) {
    const { supabase, userId, clinicId } = await getCtx();
    if (input.end_time <= input.start_time) throw new Error("เวลาออกต้องหลังเวลาเข้า");
    const { error } = await supabase.from("staff_time_logs").insert({
        clinic_id: clinicId,
        staff_id: input.staff_id,
        work_date: input.work_date,
        clock_in: `${input.work_date}T${input.start_time}:00+07:00`,
        clock_out: `${input.work_date}T${input.end_time}:00+07:00`,
        source: "manual",
        note: input.note || null,
        created_by: userId,
    });
    if (error) throw error;
    revalidatePath("/dashboard/compensation");
    return { success: true };
}

export async function deleteTimeLog(id: string) {
    const { supabase } = await getCtx();
    const { error } = await supabase.from("staff_time_logs").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/dashboard/compensation");
    return { success: true };
}

export interface AttendanceRow {
    staff_id: string;
    name: string;
    role: string;
    planned: string | null;   // "09:00–17:00"
    actual: string | null;    // "09:12–17:05" หรือ "09:12–…"
    absent: boolean;          // ลงเวรแต่ไม่มาตอกบัตร
    extra: boolean;           // ตอกบัตรแต่ไม่ได้ลงเวร
    working: boolean;         // ยังไม่ตอกออก
    late_min: number;
    early_min: number;
}

const isoToHM = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });

/** เทียบเวรที่ลงไว้ (แผน) กับเวลาตอกบัตร (จริง) ในวันที่กำหนด */
export async function getPlanVsActual(date: string): Promise<AttendanceRow[]> {
    const [shifts, logs, staff] = await Promise.all([
        getShiftsForDate(date),
        getTimeLogsForDate(date),
        getScheduleStaff(),
    ]);

    const planned = new Map<string, { start: string; end: string }>();
    shifts.forEach((s) => {
        const cur = planned.get(s.doctor_staff_id);
        if (!cur) planned.set(s.doctor_staff_id, { start: s.start_time, end: s.end_time });
        else { if (s.start_time < cur.start) cur.start = s.start_time; if (s.end_time > cur.end) cur.end = s.end_time; }
    });

    const actual = new Map<string, { inHM: string; outHM: string | null; hasOpen: boolean }>();
    logs.forEach((l) => {
        const inHM = isoToHM(l.clock_in);
        const outHM = l.clock_out ? isoToHM(l.clock_out) : null;
        const cur = actual.get(l.staff_id);
        if (!cur) actual.set(l.staff_id, { inHM, outHM, hasOpen: outHM === null });
        else {
            if (inHM < cur.inHM) cur.inHM = inHM;
            if (outHM === null) cur.hasOpen = true;
            else if (cur.outHM === null || outHM > cur.outHM) cur.outHM = outHM;
        }
    });

    const meta = new Map(staff.map((s) => [s.id, { name: s.name, role: s.role }]));
    const ids = new Set<string>([...planned.keys(), ...actual.keys()]);

    const rows: AttendanceRow[] = [];
    ids.forEach((id) => {
        const p = planned.get(id);
        const a = actual.get(id);
        let late_min = 0, early_min = 0, absent = false, extra = false, working = false;
        if (p && !a) absent = true;
        else if (!p && a) extra = true;
        else if (p && a) {
            late_min = Math.max(0, toMin(a.inHM) - toMin(p.start));
            working = a.hasOpen;
            if (!working && a.outHM) early_min = Math.max(0, toMin(p.end) - toMin(a.outHM));
        }
        const m = meta.get(id);
        rows.push({
            staff_id: id,
            name: m?.name || "—",
            role: m?.role || "",
            planned: p ? `${p.start}–${p.end}` : null,
            actual: a ? `${a.inHM}–${a.outHM ?? "…"}` : null,
            absent, extra, working, late_min, early_min,
        });
    });

    // เรียง: ขาดงาน → สาย/ออกก่อนมาก → อื่นๆ
    const sev = (r: AttendanceRow) => r.absent ? 1000 : r.late_min + r.early_min;
    return rows.sort((a, b) => sev(b) - sev(a) || a.name.localeCompare(b.name));
}

export interface MonthlyAttendanceRow {
    staff_id: string;
    name: string;
    role: string;
    planned_days: number;   // วันที่ลงเวร
    worked_days: number;    // วันที่มีตอกบัตร
    absent_days: number;    // ลงเวรแต่ไม่มา
    late_days: number;
    early_days: number;
    total_late_min: number;
    total_early_min: number;
    actual_hours: number;
    planned_hours: number;
}

/** สรุปการมาทำงานทั้งเดือน ต่อพนักงาน (month = "YYYY-MM") */
export async function getMonthlyAttendance(month: string): Promise<MonthlyAttendanceRow[]> {
    const { supabase } = await getCtx();
    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${month}-${String(lastDay).padStart(2, "0")}`;
    const GRACE = 5;

    const [shiftsRes, logsRes, staff] = await Promise.all([
        supabase.from("doctor_shifts").select("doctor_staff_id, shift_date, start_time, end_time").gte("shift_date", first).lte("shift_date", last),
        supabase.from("staff_time_logs").select("staff_id, work_date, clock_in, clock_out").gte("work_date", first).lte("work_date", last),
        getScheduleStaff(),
    ]);

    // แผน: staff → date → {start,end,mins}
    const plannedDay = new Map<string, Map<string, { start: string; end: string; mins: number }>>();
    (shiftsRes.data || []).forEach((s) => {
        const sid = s.doctor_staff_id as string, d = s.shift_date as string;
        const st = (s.start_time as string).slice(0, 5), en = (s.end_time as string).slice(0, 5);
        const dur = Math.max(0, toMin(en) - toMin(st));
        let dm = plannedDay.get(sid); if (!dm) { dm = new Map(); plannedDay.set(sid, dm); }
        const cur = dm.get(d);
        if (!cur) dm.set(d, { start: st, end: en, mins: dur });
        else { if (st < cur.start) cur.start = st; if (en > cur.end) cur.end = en; cur.mins += dur; }
    });

    // จริง: staff → date → {inHM,outHM,hasOpen,mins}
    const actualDay = new Map<string, Map<string, { inHM: string; outHM: string | null; hasOpen: boolean; mins: number }>>();
    (logsRes.data || []).forEach((l) => {
        const sid = l.staff_id as string, d = l.work_date as string;
        const inHM = isoToHM(l.clock_in as string);
        const outHM = l.clock_out ? isoToHM(l.clock_out as string) : null;
        const mins = l.clock_out ? Math.max(0, (new Date(l.clock_out as string).getTime() - new Date(l.clock_in as string).getTime()) / 60000) : 0;
        let dm = actualDay.get(sid); if (!dm) { dm = new Map(); actualDay.set(sid, dm); }
        const cur = dm.get(d);
        if (!cur) dm.set(d, { inHM, outHM, hasOpen: outHM === null, mins });
        else { if (inHM < cur.inHM) cur.inHM = inHM; if (outHM === null) cur.hasOpen = true; else if (cur.outHM === null || outHM > cur.outHM) cur.outHM = outHM; cur.mins += mins; }
    });

    const meta = new Map(staff.map((s) => [s.id, { name: s.name, role: s.role }]));
    const ids = new Set<string>([...plannedDay.keys(), ...actualDay.keys()]);

    const rows: MonthlyAttendanceRow[] = [];
    ids.forEach((id) => {
        const pDays = plannedDay.get(id) || new Map<string, { start: string; end: string; mins: number }>();
        const aDays = actualDay.get(id) || new Map<string, { inHM: string; outHM: string | null; hasOpen: boolean; mins: number }>();
        const allDates = new Set<string>([...pDays.keys(), ...aDays.keys()]);
        let planned_days = 0, worked_days = 0, absent_days = 0, late_days = 0, early_days = 0;
        let total_late_min = 0, total_early_min = 0, actual_mins = 0, planned_mins = 0;
        allDates.forEach((d) => {
            const p = pDays.get(d), a = aDays.get(d);
            if (p) { planned_days++; planned_mins += p.mins; }
            if (a) { worked_days++; actual_mins += a.mins; }
            if (p && !a) absent_days++;
            if (p && a) {
                const lm = Math.max(0, toMin(a.inHM) - toMin(p.start));
                if (lm >= GRACE) { late_days++; total_late_min += lm; }
                if (!a.hasOpen && a.outHM) {
                    const em = Math.max(0, toMin(p.end) - toMin(a.outHM));
                    if (em >= GRACE) { early_days++; total_early_min += em; }
                }
            }
        });
        const mt = meta.get(id);
        rows.push({
            staff_id: id, name: mt?.name || "—", role: mt?.role || "",
            planned_days, worked_days, absent_days, late_days, early_days, total_late_min, total_early_min,
            actual_hours: Math.round((actual_mins / 60) * 100) / 100,
            planned_hours: Math.round((planned_mins / 60) * 100) / 100,
        });
    });

    return rows.sort((a, b) => (b.absent_days - a.absent_days) || (b.late_days - a.late_days) || a.name.localeCompare(b.name));
}

export interface PayslipClinic {
    clinic_name: string | null;
    clinic_name_en: string | null;
    address_detail: string | null;
    phone: string | null;
    license_number: string | null;
}

export interface PayslipData {
    month: string;
    staff: CompRow | null;
    attendance: MonthlyAttendanceRow | null;
    clinic: PayslipClinic | null;
    payout: { adjustment: number; total_amount: number; net_amount: number; paid_at: string } | null;
}

/** ข้อมูลใบจ่ายค่าตอบแทนรายคน/เดือน (สำหรับพิมพ์) */
export async function getPayslip(staffId: string, month: string): Promise<PayslipData> {
    const { supabase } = await getCtx();
    const [comp, att] = await Promise.all([getStaffCompensation(month), getMonthlyAttendance(month)]);
    const { data: clinic } = await supabase
        .from("tenants")
        .select("clinic_name, clinic_name_en, address_detail, phone, license_number")
        .limit(1).maybeSingle();
    const { data: payout } = await supabase
        .from("compensation_payouts")
        .select("adjustment, total_amount, net_amount, paid_at")
        .eq("staff_id", staffId).eq("period_month", `${month}-01`).maybeSingle();
    return {
        month,
        staff: comp.find((r) => r.staff_id === staffId) || null,
        attendance: att.find((r) => r.staff_id === staffId) || null,
        clinic: (clinic as PayslipClinic) ?? null,
        payout: payout ? { adjustment: Number(payout.adjustment || 0), total_amount: Number(payout.total_amount || 0), net_amount: Number(payout.net_amount || 0), paid_at: payout.paid_at as string } : null,
    };
}

/** ปิดยอด/บันทึกจ่ายค่าตอบแทนของพนักงานคนเดียว (snapshot ยอดปัจจุบัน) */
export async function recordCompensationPayout(staffId: string, month: string, opts?: { payment_method?: string; note?: string; adjustment?: number; other_deduction?: number }) {
    const { supabase, userId, clinicId } = await getCtx();
    const comp = await getStaffCompensation(month);
    const row = comp.find((r) => r.staff_id === staffId);
    if (!row) throw new Error("ไม่พบข้อมูลค่าตอบแทนของพนักงาน");

    const adjustment = Number(opts?.adjustment || 0);
    const gross = round2(row.total + adjustment);
    const wht = row.wht;
    const sso = row.sso;
    const other = round2(Number(opts?.other_deduction || 0));
    const net = round2(gross - wht - sso - other);
    const { error } = await supabase.from("compensation_payouts").upsert({
        clinic_id: clinicId,
        staff_id: staffId,
        period_month: `${month}-01`,
        time_pay: row.time_pay,
        df_amount: row.df,
        adjustment,
        total_amount: gross,
        wht_amount: wht,
        sso_amount: sso,
        other_deduction: other,
        net_amount: net,
        payment_method: opts?.payment_method || "transfer",
        note: opts?.note || null,
        paid_at: new Date().toISOString(),
        paid_by: userId,
    }, { onConflict: "clinic_id,staff_id,period_month" });
    if (error) throw error;

    revalidatePath("/dashboard/compensation");
    return { success: true };
}

/** ปิดยอดทั้งเดือน — บันทึกจ่ายทุกคนที่มียอด > 0 และยังไม่ได้จ่าย */
export async function payAllForMonth(month: string) {
    const { supabase, userId, clinicId } = await getCtx();
    const comp = await getStaffCompensation(month);
    const pending = comp.filter((r) => r.total > 0 && !r.is_paid);
    if (pending.length === 0) return { success: true, count: 0 };

    const now = new Date().toISOString();
    const rows = pending.map((r) => ({
        clinic_id: clinicId,
        staff_id: r.staff_id,
        period_month: `${month}-01`,
        time_pay: r.time_pay,
        df_amount: r.df,
        total_amount: r.total,
        wht_amount: r.wht,
        sso_amount: r.sso,
        other_deduction: 0,
        net_amount: round2(r.total - r.wht - r.sso),
        payment_method: "transfer",
        paid_at: now,
        paid_by: userId,
    }));
    const { error } = await supabase.from("compensation_payouts").upsert(rows, { onConflict: "clinic_id,staff_id,period_month" });
    if (error) throw error;

    revalidatePath("/dashboard/compensation");
    return { success: true, count: rows.length };
}

/** ยกเลิกการปิดยอด (ลบบันทึกจ่าย) */
export async function deleteCompensationPayout(staffId: string, month: string) {
    const { supabase } = await getCtx();
    const { error } = await supabase.from("compensation_payouts")
        .delete()
        .eq("staff_id", staffId)
        .eq("period_month", `${month}-01`);
    if (error) throw error;
    revalidatePath("/dashboard/compensation");
    return { success: true };
}
