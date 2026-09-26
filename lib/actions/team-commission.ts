"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TEAM_POSITIONS, type TeamPosition, type TeamTier } from "@/lib/team-commission";

// คอมทีม (เฟส 2E) — กองกลางขั้นบันไดจากรายได้ความงามทั้งเดือน แบ่งตาม น้ำหนักตำแหน่ง × วันมาทำงาน
// ค่าคงที่/ชนิดตำแหน่งอยู่ที่ lib/team-commission.ts (ไฟล์ "use server" export ได้แต่ async function)

export interface TeamShareRow {
    staff_id: string;
    name: string;
    role: string;
    team_position: TeamPosition | null;
    probation_end: string | null;
    weight: number;
    work_days: number;
    score: number;
    amount: number;
    note: string | null;   // เหตุผลที่ไม่ได้ (ยังไม่ตั้งตำแหน่ง / กรรมการ / ทดลองงาน)
}
export interface TeamCommissionReport {
    month: string;
    received: number;          // เงินรับจริงฝั่งความงาม (ก่อนถ่วง %)
    base: number;              // ฐานคอมทีม (ถ่วง % นับเข้าคอมทีมแล้ว)
    tiers: TeamTier[];
    tierPct: number;
    nextTier: TeamTier | null;
    pool: number;
    totalScore: number;
    over1M: boolean;
    rows: TeamShareRow[];
    topItems: { item_name: string; received: number; counted: number; team_pct: number }[];
    approved: { at: string; note: string | null } | null;
    canManage: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, role").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("ไม่พบคลินิก");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string, canManage: ["owner", "admin"].includes(String(profile.role)) };
}

function monthBounds(month: string) {
    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { first, last };
}

async function computeLive(month: string): Promise<TeamCommissionReport> {
    const { supabase, clinicId, canManage } = await ctx();
    const { first, last } = monthBounds(month);

    // ฐาน: รายได้ความงามที่รับจริงในเดือน
    const lines: { item_name: string; team_pct: number; received: number; counted: number }[] = [];
    for (let start = 0; ; start += 1000) {
        const { data } = await supabase.from("v_team_revenue_lines")
            .select("item_name, team_pct, received, counted")
            .eq("clinic_id", clinicId).eq("period_month", month)
            .range(start, start + 999);
        (data || []).forEach(d => lines.push({ item_name: d.item_name as string, team_pct: Number(d.team_pct), received: Number(d.received || 0), counted: Number(d.counted || 0) }));
        if (!data || data.length < 1000) break;
    }
    const received = r2(lines.reduce((s, l) => s + l.received, 0));
    const base = r2(lines.reduce((s, l) => s + l.counted, 0));
    const byItem = new Map<string, { item_name: string; received: number; counted: number; team_pct: number }>();
    lines.forEach(l => {
        const k = `${l.item_name}|${l.team_pct}`;
        const g = byItem.get(k) || { item_name: l.item_name, received: 0, counted: 0, team_pct: l.team_pct };
        g.received += l.received; g.counted += l.counted; byItem.set(k, g);
    });
    const topItems = [...byItem.values()].map(g => ({ ...g, received: r2(g.received), counted: r2(g.counted) }))
        .sort((a, b) => b.counted - a.counted).slice(0, 15);

    // ขั้นบันได ณ ต้นเดือน
    const { data: tierSet } = await supabase.from("team_comm_tier_sets")
        .select("tiers").eq("clinic_id", clinicId).lte("effective_from", first)
        .order("effective_from", { ascending: false }).limit(1).maybeSingle();
    const tiers = ((tierSet?.tiers as TeamTier[]) || []).map(t => ({ min: Number(t.min), pct: Number(t.pct) })).sort((a, b) => a.min - b.min);
    const hit = [...tiers].reverse().find(t => base >= t.min);
    const tierPct = hit?.pct || 0;
    const nextTier = tiers.find(t => t.min > base) || null;
    const pool = r2(base * tierPct / 100);

    // น้ำหนักตำแหน่ง ณ สิ้นเดือน
    const weights: Record<string, number> = {};
    await Promise.all(TEAM_POSITIONS.filter(p => p.rateKey).map(async p => {
        const { data } = await supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: p.rateKey!, p_date: last });
        weights[p.value] = Number(data ?? p.defaultWeight);
    }));

    // พนักงาน (รวมคนที่ลาออกระหว่างเดือน)
    const { data: staffRows } = await supabase.from("staff")
        .select("id, is_active, resigned_on, team_position, probation_end, profiles!inner(full_name, role)")
        .or(`is_active.eq.true,resigned_on.gte.${first}`);
    const { data: logs } = await supabase.from("staff_time_logs")
        .select("staff_id, work_date").gte("work_date", first).lte("work_date", last);
    const days = new Map<string, Set<string>>();
    (logs || []).forEach(l => {
        const sid = l.staff_id as string;
        let s = days.get(sid); if (!s) { s = new Set(); days.set(sid, s); }
        s.add(l.work_date as string);
    });

    const rows: TeamShareRow[] = (staffRows || []).map(s => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = Array.isArray((s as any).profiles) ? (s as any).profiles[0] : (s as any).profiles;
        const pos = (s.team_position as TeamPosition | null) || null;
        const probation = (s.probation_end as string | null) || null;
        const wd = [...(days.get(s.id as string) || [])].filter(d => !probation || d > probation).length;
        const weight = pos && pos !== "excluded" ? (weights[pos] ?? 0) : 0;
        let note: string | null = null;
        if (!pos) note = "ยังไม่ตั้งตำแหน่ง";
        else if (pos === "excluded") note = "กรรมการ/ผู้ถือหุ้น";
        else if (probation && probation >= last) note = "ยังไม่พ้นทดลองงาน";
        else if (wd === 0) note = "ไม่มีวันทำงาน";
        return {
            staff_id: s.id as string, name: (p?.full_name as string) || "—", role: (p?.role as string) || "",
            team_position: pos, probation_end: probation, weight, work_days: wd, score: r2(weight * wd), amount: 0, note,
        };
    });
    const totalScore = r2(rows.reduce((a, r) => a + r.score, 0));
    rows.forEach(r => { r.amount = totalScore > 0 ? r2(pool * r.score / totalScore) : 0; });
    rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "th"));

    return { month, received, base, tiers, tierPct, nextTier, pool, totalScore, over1M: base >= 1_000_000, rows, topItems, approved: null, canManage };
}

export async function getTeamCommission(month: string): Promise<TeamCommissionReport | { error: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "เดือนไม่ถูกต้อง" };
        const live = await computeLive(month);
        const { supabase, clinicId } = await ctx();
        const { first } = monthBounds(month);
        const { data: snap } = await supabase.from("team_comm_months").select("*").eq("clinic_id", clinicId).eq("period_month", first).maybeSingle();
        if (!snap) return live;
        // อนุมัติแล้ว → ใช้ snapshot (ตัวเลขไม่ขยับแม้มีคืนเงิน/แก้เวลาทีหลัง)
        const { data: shares } = await supabase.from("team_comm_shares").select("*").eq("clinic_id", clinicId).eq("period_month", first);
        const nameMap = new Map(live.rows.map(r => [r.staff_id, r]));
        const rows: TeamShareRow[] = (shares || []).map(s => ({
            staff_id: s.staff_id as string, name: nameMap.get(s.staff_id as string)?.name || "—", role: nameMap.get(s.staff_id as string)?.role || "",
            team_position: s.team_position as TeamPosition, probation_end: nameMap.get(s.staff_id as string)?.probation_end || null,
            weight: Number(s.weight), work_days: Number(s.work_days), score: Number(s.score), amount: Number(s.amount), note: null,
        })).sort((a, b) => b.amount - a.amount);
        const base = Number(snap.base_revenue);
        return {
            ...live, base, tierPct: Number(snap.tier_pct), pool: Number(snap.pool), totalScore: Number(snap.total_score),
            over1M: base >= 1_000_000, rows, approved: { at: snap.approved_at as string, note: (snap.note as string) || null },
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

export async function approveTeamCommission(month: string, note?: string) {
    try {
        const { supabase, clinicId, userId, canManage } = await ctx();
        if (!canManage) return { success: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const live = await computeLive(month);
        if (live.pool <= 0) return { success: false, error: "ยอดยังไม่ถึงขั้นแรก — ไม่มีกองกลางให้แบ่ง" };
        const { first } = monthBounds(month);
        const { error: e1 } = await supabase.from("team_comm_months").insert({
            clinic_id: clinicId, period_month: first, base_revenue: live.base, tier_pct: live.tierPct, pool: live.pool,
            total_score: live.totalScore, note: note?.trim() || null, approved_by: userId,
        });
        if (e1) return { success: false, error: e1.code === "23505" ? "เดือนนี้อนุมัติไปแล้ว" : e1.message };
        const shares = live.rows.filter(r => r.amount > 0).map(r => ({
            clinic_id: clinicId, period_month: first, staff_id: r.staff_id, team_position: r.team_position!,
            weight: r.weight, work_days: r.work_days, score: r.score, amount: r.amount,
        }));
        if (shares.length) {
            const { error: e2 } = await supabase.from("team_comm_shares").insert(shares);
            if (e2) {
                await supabase.from("team_comm_months").delete().eq("clinic_id", clinicId).eq("period_month", first);
                return { success: false, error: e2.message };
            }
        }
        revalidatePath("/dashboard/finance/team-commission");
        revalidatePath("/dashboard/compensation");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "อนุมัติไม่สำเร็จ" };
    }
}

export async function unapproveTeamCommission(month: string) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { success: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { first } = monthBounds(month);
        const { count } = await supabase.from("compensation_payouts").select("id", { count: "exact", head: true })
            .eq("period_month", first).gt("team_comm_amount", 0);
        if ((count || 0) > 0) return { success: false, error: "จ่ายค่าตอบแทนเดือนนี้ไปแล้ว — ยกเลิกการจ่ายในหน้าค่าตอบแทนก่อน" };
        const { error } = await supabase.from("team_comm_months").delete().eq("clinic_id", clinicId).eq("period_month", first);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/finance/team-commission");
        revalidatePath("/dashboard/compensation");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ" };
    }
}

export async function setStaffTeamInfo(staffId: string, patch: { team_position?: TeamPosition | null; probation_end?: string | null }) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { success: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const upd: Record<string, unknown> = {};
        if (patch.team_position !== undefined) {
            if (patch.team_position && !TEAM_POSITIONS.some(p => p.value === patch.team_position)) return { success: false, error: "ตำแหน่งไม่ถูกต้อง" };
            upd.team_position = patch.team_position || null;
        }
        if (patch.probation_end !== undefined) upd.probation_end = patch.probation_end || null;
        const { error } = await supabase.from("staff").update(upd).eq("id", staffId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/finance/team-commission");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}

export async function saveTeamTiers(effectiveFrom: string, tiers: TeamTier[], note?: string) {
    try {
        const { supabase, clinicId, userId, canManage } = await ctx();
        if (!canManage) return { success: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        if (!/^\d{4}-\d{2}-01$/.test(effectiveFrom)) return { success: false, error: "วันเริ่มใช้ต้องเป็นวันที่ 1 ของเดือน" };
        const clean = tiers.map(t => ({ min: Number(t.min), pct: Number(t.pct) })).filter(t => t.min > 0 && t.pct > 0).sort((a, b) => a.min - b.min);
        if (clean.length === 0) return { success: false, error: "ต้องมีอย่างน้อย 1 ขั้น" };
        if (clean.some(t => t.pct > 100)) return { success: false, error: "% ต้องไม่เกิน 100" };
        const { error } = await supabase.from("team_comm_tier_sets").upsert({
            clinic_id: clinicId, effective_from: effectiveFrom, tiers: clean, note: note?.trim() || null, created_by: userId,
        }, { onConflict: "clinic_id,effective_from" });
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/finance/team-commission");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}
