"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { pushLineText } from "@/lib/line";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, full_name").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string, actorName: (profile.full_name as string) || "" };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FollowUpStatus = "pending" | "contacted" | "unreachable" | "callback" | "done" | "cancelled";
export type Severity = "green" | "yellow" | "red";

export interface FollowUpTask {
    id: string;
    hn: string;
    patient_name: string;
    phone: string | null;
    line_user_id: string | null;
    vn: string | null;
    service_name: string | null;
    due_date: string;
    status: FollowUpStatus;
    severity: Severity;
    symptom_note: string | null;
    assigned_doctor_id: string | null;
    doctor_name: string | null;
    escalated_at: string | null;
}

/** สร้าง task ติดตามผลอัตโนมัติจากบิลที่ชำระแล้ว (เรียกแบบ non-blocking หลังจ่ายเงิน) */
export async function generateFollowUpTasks(invId: string): Promise<{ success: boolean; created?: number; error?: string }> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data: inv } = await supabase.from("invoice_headers")
            .select("id, hn, vn, invoice_date, status, clinic_id").eq("id", invId).eq("clinic_id", clinicId).maybeSingle();
        if (!inv) return { success: false, error: "ไม่พบบิล" };
        if (inv.status !== "paid") return { success: true, created: 0 };

        // idempotent — ถ้ามี task ของบิลนี้แล้ว ไม่สร้างซ้ำ
        const { count: existing } = await supabase.from("follow_up_tasks")
            .select("id", { count: "exact", head: true }).eq("invoice_id", invId);
        if ((existing ?? 0) > 0) return { success: true, created: 0 };

        const { data: items } = await supabase.from("invoice_items")
            .select("item_ref_id, item_name").eq("inv_id", invId);
        const refIds = [...new Set((items || []).map(i => ((i.item_ref_id as string) || "").trim().toLowerCase()))].filter(r => UUID_RE.test(r));
        if (refIds.length === 0) return { success: true, created: 0 };

        const { data: svcs } = await supabase.from("service_catalog")
            .select("id, service_name, follow_up_days").in("id", refIds).not("follow_up_days", "is", null);
        const svcMap: Record<string, { name: string; days: number[] }> = {};
        (svcs || []).forEach(s => {
            const days = String(s.follow_up_days || "").split(",").map(x => parseInt(x.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0);
            if (days.length) svcMap[(s.id as string).toLowerCase()] = { name: s.service_name as string, days };
        });
        if (Object.keys(svcMap).length === 0) return { success: true, created: 0 };

        // แพทย์เจ้าของไข้ (จาก visit)
        let doctorId: string | null = null;
        if (inv.vn) {
            const { data: v } = await supabase.from("visits").select("doctor_id").eq("vn", inv.vn).maybeSingle();
            doctorId = (v?.doctor_id as string) || null;
        }

        const baseDate = inv.invoice_date as string;
        const rows: Record<string, unknown>[] = [];
        for (const it of items || []) {
            const ref = ((it.item_ref_id as string) || "").trim().toLowerCase();
            const svc = svcMap[ref];
            if (!svc) continue;
            for (const d of svc.days) {
                const due = new Date(baseDate + "T00:00:00"); due.setDate(due.getDate() + d);
                rows.push({
                    clinic_id: clinicId, hn: inv.hn, vn: inv.vn, invoice_id: invId,
                    service_name: svc.name, due_date: due.toISOString().slice(0, 10),
                    assigned_doctor_id: doctorId,
                });
            }
        }
        if (rows.length === 0) return { success: true, created: 0 };
        const { error } = await supabase.from("follow_up_tasks").insert(rows);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/follow-up");
        return { success: true, created: rows.length };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ลิสต์งานติดตามของวัน (default วันนี้) — เรียงตาม severity แดง→เขียว แล้ว due */
export async function getFollowUpsForDate(dateStr?: string, opts?: { includeOverdue?: boolean }): Promise<FollowUpTask[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const target = dateStr || new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
        let q = supabase.from("follow_up_tasks")
            .select("id, hn, vn, service_name, due_date, status, severity, symptom_note, assigned_doctor_id, escalated_at")
            .eq("clinic_id", clinicId).in("status", ["pending", "callback", "unreachable"]);
        q = opts?.includeOverdue ? q.lte("due_date", target) : q.eq("due_date", target);
        const { data } = await q.order("due_date", { ascending: true }).limit(500);
        const tasks = data || [];
        if (tasks.length === 0) return [];

        // ชื่อ/เบอร์/line ผู้ป่วย
        const hns = [...new Set(tasks.map(t => t.hn as string))];
        const patMap: Record<string, { name: string; phone: string | null; line: string | null }> = {};
        if (hns.length) {
            const { data: pats } = await supabase.from("patients").select("hn, first_name, last_name, phone, line_user_id").in("hn", hns).eq("clinic_id", clinicId);
            (pats || []).forEach(p => { patMap[p.hn as string] = { name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || (p.hn as string), phone: (p.phone as string) || null, line: (p.line_user_id as string) || null }; });
        }
        // ชื่อแพทย์
        const docIds = [...new Set(tasks.map(t => t.assigned_doctor_id).filter(Boolean))] as string[];
        const docMap: Record<string, string> = {};
        if (docIds.length) {
            const { data: staff } = await supabase.from("staff").select("id, profiles(full_name)").in("id", docIds);
            (staff || []).forEach(s => { const rel = s.profiles as unknown as { full_name?: string } | { full_name?: string }[] | null; const p = Array.isArray(rel) ? rel[0] : rel; docMap[s.id as string] = p?.full_name || "—"; });
        }
        const sevRank: Record<string, number> = { red: 0, yellow: 1, green: 2 };
        return tasks.map(t => ({
            id: t.id as string, hn: t.hn as string,
            patient_name: patMap[t.hn as string]?.name || (t.hn as string),
            phone: patMap[t.hn as string]?.phone || null, line_user_id: patMap[t.hn as string]?.line || null,
            vn: (t.vn as string) || null, service_name: (t.service_name as string) || null,
            due_date: t.due_date as string, status: t.status as FollowUpStatus, severity: t.severity as Severity,
            symptom_note: (t.symptom_note as string) || null,
            assigned_doctor_id: (t.assigned_doctor_id as string) || null,
            doctor_name: t.assigned_doctor_id ? (docMap[t.assigned_doctor_id as string] || null) : null,
            escalated_at: (t.escalated_at as string) || null,
        })).sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || a.due_date.localeCompare(b.due_date));
    } catch {
        return [];
    }
}

/** อัปเดตสถานะ + บันทึกอาการ (เก็บ log) */
export async function updateFollowUpStatus(taskId: string, status: FollowUpStatus, note?: string) {
    try {
        const { supabase, userId, clinicId } = await ctx();
        const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
        if (note !== undefined) patch.symptom_note = note || null;
        if (status === "done") { patch.completed_at = new Date().toISOString(); patch.completed_by = userId; }
        const { error } = await supabase.from("follow_up_tasks").update(patch).eq("id", taskId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        await supabase.from("follow_up_task_log").insert({ clinic_id: clinicId, task_id: taskId, action: "status_change", status, note: note || null, actor_id: userId });
        revalidatePath("/dashboard/follow-up");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ตั้งระดับความรุนแรง (เขียว/เหลือง/แดง) */
export async function setFollowUpSeverity(taskId: string, severity: Severity) {
    try {
        const { supabase, userId, clinicId } = await ctx();
        const { error } = await supabase.from("follow_up_tasks").update({ severity, updated_at: new Date().toISOString() }).eq("id", taskId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        await supabase.from("follow_up_task_log").insert({ clinic_id: clinicId, task_id: taskId, action: "severity", severity, actor_id: userId });
        revalidatePath("/dashboard/follow-up");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ส่งเตือนแพทย์เจ้าของไข้ (LINE + in-app log) — complication escalation */
export async function escalateFollowUp(taskId: string, note?: string) {
    try {
        const { supabase, userId, clinicId, actorName } = await ctx();
        const { data: task } = await supabase.from("follow_up_tasks")
            .select("hn, service_name, assigned_doctor_id, severity").eq("id", taskId).eq("clinic_id", clinicId).maybeSingle();
        if (!task) return { success: false, error: "ไม่พบงานติดตาม" };

        await supabase.from("follow_up_tasks").update({
            escalated_at: new Date().toISOString(), escalated_by: userId,
            severity: task.severity === "green" ? "yellow" : task.severity, updated_at: new Date().toISOString(),
        }).eq("id", taskId).eq("clinic_id", clinicId);

        // หา line_user_id ของแพทย์เจ้าของไข้
        let lineOk = false, lineErr: string | null = "แพทย์ยังไม่ได้ผูก LINE";
        if (task.assigned_doctor_id) {
            const { data: st } = await supabase.from("staff").select("profile_id").eq("id", task.assigned_doctor_id).maybeSingle();
            if (st?.profile_id) {
                const { data: prof } = await supabase.from("profiles").select("line_user_id, full_name").eq("id", st.profile_id).maybeSingle();
                if (prof?.line_user_id) {
                    const { data: pat } = await supabase.from("patients").select("first_name, last_name, phone").eq("hn", task.hn).eq("clinic_id", clinicId).maybeSingle();
                    const pname = pat ? `${pat.first_name || ""} ${pat.last_name || ""}`.trim() : task.hn;
                    const msg = `🚨 แจ้งเตือนเคสติดตามผล\nคนไข้: ${pname} (HN ${task.hn})\nบริการ: ${task.service_name || "-"}\n${note ? `อาการ: ${note}\n` : ""}แจ้งโดย: ${actorName}\nกรุณาตรวจสอบด่วน`;
                    const r = await pushLineText(prof.line_user_id as string, msg);
                    lineOk = r.ok; lineErr = r.ok ? null : (r.error || "ส่ง LINE ไม่สำเร็จ");
                }
            }
        }
        await supabase.from("follow_up_task_log").insert({ clinic_id: clinicId, task_id: taskId, action: "escalate", note: note || null, actor_id: userId });
        revalidatePath("/dashboard/follow-up");
        return { success: true, lineOk, lineErr };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

export interface FollowUpLogEntry { id: string; action: string; status: string | null; severity: string | null; note: string | null; actor_name: string | null; created_at: string; }
export interface PatientFollowUp extends FollowUpTask { logs: FollowUpLogEntry[]; }

/** ผู้ป่วยรายงานอาการเองผ่าน LINE (LIFF) — anon context ใช้ service client bypass RLS */
export async function submitSelfReport(lineUid: string, severity: Severity, note: string): Promise<{ ok: boolean; error?: string }> {
    try {
        if (!lineUid) return { ok: false, error: "เปิดผ่าน LINE เท่านั้น" };
        const supabase = createServiceClient();
        const { data: pat } = await supabase.from("patients")
            .select("hn, clinic_id, first_name, last_name").eq("line_user_id", lineUid).limit(1).maybeSingle();
        if (!pat) return { ok: false, error: "ยังไม่ได้ผูกบัญชี LINE กับคลินิก" };
        const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
        const { data: task, error } = await supabase.from("follow_up_tasks").insert({
            clinic_id: pat.clinic_id, hn: pat.hn, service_name: "รายงานอาการเอง (ผ่าน LINE)",
            due_date: today, severity, symptom_note: note || null, self_reported: true, status: "pending",
        }).select("id").single();
        if (error) return { ok: false, error: error.message };
        await supabase.from("follow_up_task_log").insert({ clinic_id: pat.clinic_id, task_id: task.id, action: "self_report", severity, note: note || null });

        // แจ้ง owner ถ้าอาการด่วน/ผิดปกติ
        if (severity !== "green") {
            const { data: owners } = await supabase.from("profiles").select("line_user_id").eq("clinic_id", pat.clinic_id).eq("role", "owner").not("line_user_id", "is", null);
            const pname = `${pat.first_name || ""} ${pat.last_name || ""}`.trim() || pat.hn;
            const msg = `📩 คนไข้รายงานอาการเอง (${severity === "red" ? "ด่วน 🔴" : "ผิดปกติ 🟡"})\nคนไข้: ${pname} (HN ${pat.hn})\nอาการ: ${note || "-"}\nกรุณาติดต่อกลับ`;
            for (const o of owners || []) await pushLineText(o.line_user_id as string, msg);
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ลิงก์ขอรีวิวของคลินิก */
export async function getClinicReviewUrl(): Promise<string | null> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("tenants").select("review_url").eq("id", clinicId).maybeSingle();
        return (data?.review_url as string) || null;
    } catch {
        return null;
    }
}

/** ตั้งลิงก์ขอรีวิว (เจ้าของ/แอดมิน) */
export async function setClinicReviewUrl(url: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { role } = await getEffectivePermissionsForUser();
        if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะเจ้าของ/แอดมินตั้งได้" };
        const { error } = await supabase.from("tenants").update({ review_url: url.trim() || null }).eq("id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/follow-up");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** log จังหวะพึงพอใจ (ขอรีวิว/เสนอ referral) */
export async function logFollowUpAction(taskId: string, action: "review_sent" | "referral_sent") {
    try {
        const { supabase, userId, clinicId } = await ctx();
        await supabase.from("follow_up_task_log").insert({ clinic_id: clinicId, task_id: taskId, action, actor_id: userId });
        return { success: true };
    } catch {
        return { success: false };
    }
}

export interface SafetyMetrics {
    cases: number;              // เคสที่มีงานติดตาม
    complicationCases: number;  // เคสที่ flag เหลือง/แดง หรือ escalate
    complicationPct: number;
    escalations: number;
    avgResponseMin: number | null;  // เฉลี่ยเวลาจาก escalate → เสร็จ (นาที)
}

/** เมตริกความปลอดภัยเชิงคลินิก (สำหรับหน้ารายงาน) */
export async function getSafetyMetrics(startDate: string, endDate: string): Promise<SafetyMetrics> {
    const empty: SafetyMetrics = { cases: 0, complicationCases: 0, complicationPct: 0, escalations: 0, avgResponseMin: null };
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("follow_up_tasks")
            .select("vn, hn, severity, escalated_at, completed_at").eq("clinic_id", clinicId)
            .gte("due_date", startDate).lte("due_date", endDate);
        const rows = data || [];
        if (rows.length === 0) return empty;

        const caseKey = (r: { vn: string | null; hn: string }) => (r.vn as string) || (r.hn as string);
        const allCases = new Set(rows.map(r => caseKey(r as { vn: string | null; hn: string })));
        const compCases = new Set(rows.filter(r => r.severity === "yellow" || r.severity === "red" || r.escalated_at).map(r => caseKey(r as { vn: string | null; hn: string })));
        const escalated = rows.filter(r => r.escalated_at);
        const responseMins: number[] = [];
        escalated.forEach(r => {
            if (r.escalated_at && r.completed_at) {
                const mins = (new Date(r.completed_at as string).getTime() - new Date(r.escalated_at as string).getTime()) / 60000;
                if (mins >= 0) responseMins.push(mins);
            }
        });
        return {
            cases: allCases.size,
            complicationCases: compCases.size,
            complicationPct: allCases.size > 0 ? Math.round((compCases.size / allCases.size) * 1000) / 10 : 0,
            escalations: escalated.length,
            avgResponseMin: responseMins.length ? Math.round(responseMins.reduce((s, v) => s + v, 0) / responseMins.length) : null,
        };
    } catch {
        return empty;
    }
}

/** งานติดตามของผู้ป่วย (สำหรับ patient profile) + log */
export async function getPatientFollowUps(hn: string): Promise<PatientFollowUp[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data: tasks } = await supabase.from("follow_up_tasks")
            .select("id, hn, vn, service_name, due_date, status, severity, symptom_note, assigned_doctor_id, escalated_at, created_at")
            .eq("clinic_id", clinicId).eq("hn", hn).order("due_date", { ascending: false }).limit(100);
        const tList = tasks || [];
        if (tList.length === 0) return [];
        const ids = tList.map(t => t.id as string);
        const { data: logs } = await supabase.from("follow_up_task_log")
            .select("id, task_id, action, status, severity, note, actor_id, created_at").in("task_id", ids).order("created_at", { ascending: false });
        const actorIds = [...new Set((logs || []).map(l => l.actor_id).filter(Boolean))] as string[];
        const nameById: Record<string, string> = {};
        if (actorIds.length) { const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds); (profs || []).forEach(p => { nameById[p.id as string] = (p.full_name as string) || ""; }); }
        const logsByTask: Record<string, FollowUpLogEntry[]> = {};
        (logs || []).forEach(l => {
            (logsByTask[l.task_id as string] = logsByTask[l.task_id as string] || []).push({
                id: l.id as string, action: l.action as string, status: (l.status as string) || null, severity: (l.severity as string) || null,
                note: (l.note as string) || null, actor_name: l.actor_id ? (nameById[l.actor_id as string] || null) : null, created_at: l.created_at as string,
            });
        });
        return tList.map(t => ({
            id: t.id as string, hn: t.hn as string, patient_name: "", phone: null, line_user_id: null,
            vn: (t.vn as string) || null, service_name: (t.service_name as string) || null, due_date: t.due_date as string,
            status: t.status as FollowUpStatus, severity: t.severity as Severity, symptom_note: (t.symptom_note as string) || null,
            assigned_doctor_id: (t.assigned_doctor_id as string) || null, doctor_name: null, escalated_at: (t.escalated_at as string) || null,
            logs: logsByTask[t.id as string] || [],
        }));
    } catch {
        return [];
    }
}
