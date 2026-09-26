"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";

// คอมแนะนำ (เฟส 2D) — กฎทั้งหมดบังคับที่ DB (fn_set_staff_referral / fn_cancel_staff_referral)

export type StaffReferralRow = {
    id: string;
    staff_id: string;
    staff_name: string;
    kind: "new" | "returning";
    started_on: string;
    ended_on: string | null;
    end_reason: "lapsed" | "staff_left" | "cancelled" | null;
    note: string | null;
};

export type PatientStaffReferral = {
    active: StaffReferralRow | null;
    history: StaffReferralRow[];
    lastVisit: string | null;       // มาครั้งล่าสุดก่อนวันนี้
    lapseMonths: number;
    canRegister: "new" | "returning" | null;   // บันทึกผู้แนะนำได้ไหม (ประเมินฝั่ง UI — DB ตรวจซ้ำ)
    lapsedAt: string | null;        // active แต่หลุดแล้ว (ไม่มาเกินกำหนด) — จะปิดอัตโนมัติตอนออกบิลถัดไป
};

const addMonths = (d: string, m: number) => {
    const t = new Date(`${d}T00:00:00Z`); t.setUTCMonth(t.getUTCMonth() + m); return t.toISOString().slice(0, 10);
};

export async function getPatientStaffReferral(hn: string): Promise<PatientStaffReferral | null> {
    try {
        const supabase = await createClient();
        const today = bangkokDate();
        const { data: prof } = await supabase.from("profiles").select("clinic_id").eq("id", (await supabase.auth.getUser()).data.user?.id || "").maybeSingle();
        if (!prof?.clinic_id) return null;
        const [{ data: rows }, { data: lastV }, { data: pt }, { data: rate }] = await Promise.all([
            supabase.from("staff_referrals")
                .select("id, staff_id, kind, started_on, ended_on, end_reason, note, staff:staff_id(profiles(full_name))")
                .eq("hn", hn).order("started_on", { ascending: false }).order("created_at", { ascending: false }),
            supabase.from("visits").select("visit_date").eq("hn", hn).lt("visit_date", today).order("visit_date", { ascending: false }).limit(1),
            supabase.from("patients").select("first_visit_date, created_at").eq("hn", hn).maybeSingle(),
            supabase.rpc("fn_finance_rate", { p_clinic: prof.clinic_id, p_key: "ref_lapse_months", p_date: today }),
        ]);
        const lapseMonths = Number(rate) || 12;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const history: StaffReferralRow[] = (rows || []).map((r: any) => {
            const s = Array.isArray(r.staff) ? r.staff[0] : r.staff;
            const p = s ? (Array.isArray(s.profiles) ? s.profiles[0] : s.profiles) : null;
            return { id: r.id, staff_id: r.staff_id, staff_name: p?.full_name || "—", kind: r.kind, started_on: r.started_on, ended_on: r.ended_on, end_reason: r.end_reason, note: r.note };
        });
        const active = history.find(h => !h.ended_on) || null;
        const lastVisit = (lastV?.[0]?.visit_date as string) || null;
        const cutoff = addMonths(today, -lapseMonths);
        let lapsedAt: string | null = null;
        if (active) {
            const act = lastVisit && lastVisit > active.started_on ? lastVisit : active.started_on;
            if (act < cutoff) lapsedAt = addMonths(act, lapseMonths);
        }
        const regDay = (pt?.first_visit_date as string) || (pt?.created_at ? String(pt.created_at).slice(0, 10) : "");
        let canRegister: PatientStaffReferral["canRegister"] = null;
        if (!active || lapsedAt) {
            if (!lastVisit && regDay >= today && history.length === 0) canRegister = "new";
            else if (lastVisit && lastVisit < cutoff) canRegister = "returning";
        }
        return { active, history, lastVisit, lapseMonths, canRegister, lapsedAt };
    } catch {
        return null;
    }
}

export async function setStaffReferral(hn: string, staffId: string, note?: string) {
    try {
        const supabase = await createClient();
        const { error } = await supabase.rpc("fn_set_staff_referral", { p_hn: hn, p_staff_id: staffId, p_note: note || null });
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}

export async function cancelStaffReferral(id: string, reason: string, hn: string) {
    try {
        const supabase = await createClient();
        const { error } = await supabase.rpc("fn_cancel_staff_referral", { p_id: id, p_reason: reason });
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ" };
    }
}

/** พนักงานที่เลือกเป็นผู้แนะนำได้ (active) */
export async function listReferralStaff(): Promise<{ id: string; name: string }[]> {
    try {
        const supabase = await createClient();
        const { data } = await supabase.from("staff").select("id, profiles!inner(full_name)").eq("is_active", true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data || []).map((d: any) => {
            const p = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
            return { id: d.id as string, name: (p?.full_name as string) || "—" };
        }).sort((a, b) => a.name.localeCompare(b.name, "th"));
    } catch {
        return [];
    }
}
