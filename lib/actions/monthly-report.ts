"use server";

import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";

// รายงานรายเดือน (เฟส 5B) — แถวละเดือน (เดือนปฏิทิน) ตามสเปก:
// รายได้เวชกรรม · รายได้ความงาม · ต้นทุนยาที่ใช้จริง · ค่าตอบแทนแพทย์ · ค่ามือ + คอม · ค่าธรรมเนียมบัตร
// · ต้นทุนคงที่ (+ เงินเดือนพนักงาน) · ยาทิ้ง · การตลาด · กำไรก่อนภาษี · กำไรสะสม

export interface MonthRow {
    month: string;
    revMedical: number;
    revAesthetic: number;
    revenue: number;
    courseCash: number;        // เงินรับค่าคอส (ยังไม่เป็นรายได้ — ข้อมูลประกอบ)
    breakage: number;          // รวมอยู่ใน revenue แล้ว
    material: number;
    doctorComp: number;        // ค่าชั่วโมงแพทย์ + DF แพทย์
    handComm: number;          // ค่ามือ + คอมแนะนำ + คอมเซลล์คอส + คอมทีม (อนุมัติแล้ว)
    teamApproved: boolean;
    cardFee: number;
    staffPay: number;          // เงินเดือน/ค่าจ้างพนักงาน (ไม่ใช่แพทย์)
    fixed: number;             // ต้นทุนคงที่ (จ่ายจริง ไม่รวมหมวดการตลาด)
    fixedPlanned: number;      // รายการวางแผน (แสดงแยก)
    waste: number;
    marketing: number;         // แอด + ต้นทุนคงที่หมวดการตลาด + ค่ามือเคสรีวิว
    pettyCash: number;
    costTotal: number;
    profit: number;
    cumulative: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const DOCTOR_ROLES = new Set(["doctor", "dentist"]);
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

export async function getMonthlyReport(year: number): Promise<{ year: number; rows: MonthRow[]; totals: MonthRow } | { error: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: "Unauthorized" };
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        const clinicId = profile?.clinic_id as string;
        if (!clinicId) return { error: "ไม่พบคลินิก" };

        const today = bangkokDate();
        const curMonth = today.slice(0, 7);
        const months: string[] = [];
        for (let m = 1; m <= 12; m++) {
            const k = `${year}-${String(m).padStart(2, "0")}`;
            if (k > curMonth) break;
            months.push(k);
        }
        if (months.length === 0) return { year, rows: [], totals: emptyRow("รวม") };
        const from = `${months[0]}-01`;
        const lastM = months[months.length - 1];
        const [ly, lm] = lastM.split("-").map(Number);
        const to = new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10);

        // ── ตัวเลขจากบิล/การชำระ/คลัง (SQL) ──
        const { data: metrics, error: mErr } = await supabase.rpc("fn_monthly_finance_metrics", { p_clinic: clinicId, p_from: from, p_to: to });
        if (mErr) return { error: mErr.message };
        const M = new Map<string, Record<string, number>>();
        (metrics || []).forEach((r: { period_month: string; metric: string; amount: number }) => {
            const g = M.get(r.period_month) || {};
            g[r.metric] = (g[r.metric] || 0) + Number(r.amount || 0);
            M.set(r.period_month, g);
        });

        // ── DF/ค่ามือ/คอม (v_commission_summary) ──
        const comm = new Map<string, { doctor: number; other: number }>();
        for (let start = 0; ; start += 1000) {
            const { data } = await supabase.from("v_commission_summary").select("period_month, role, commission_amount")
                .eq("clinic_id", clinicId).in("period_month", months).range(start, start + 999);
            (data || []).forEach(d => {
                const g = comm.get(d.period_month as string) || { doctor: 0, other: 0 };
                if (d.role === "doctor") g.doctor += Number(d.commission_amount || 0); else g.other += Number(d.commission_amount || 0);
                comm.set(d.period_month as string, g);
            });
            if (!data || data.length < 1000) break;
        }
        const { data: teams } = await supabase.from("team_comm_months").select("period_month, pool").eq("clinic_id", clinicId).gte("period_month", from).lte("period_month", to);
        const teamMap = new Map((teams || []).map(t => [(t.period_month as string).slice(0, 7), Number(t.pool || 0)]));

        // ── ค่าจ้างตามเวลา/เงินเดือน (ใช้ snapshot ที่จ่ายแล้วก่อน) ──
        const [{ data: staff }, { data: logs }, { data: shifts }, { data: payouts }] = await Promise.all([
            supabase.from("staff").select("id, pay_type, hourly_rate, monthly_salary, is_active, resigned_on, profiles!inner(role)"),
            supabase.from("staff_time_logs").select("staff_id, work_date, clock_in, clock_out").gte("work_date", from).lte("work_date", to).not("clock_out", "is", null),
            supabase.from("doctor_shifts").select("doctor_staff_id, shift_date, start_time, end_time").gte("shift_date", from).lte("shift_date", to),
            supabase.from("compensation_payouts").select("staff_id, period_month, time_pay").gte("period_month", from).lte("period_month", to),
        ]);
        const docRates = new Map<string, number>();
        await Promise.all(months.map(async mo => {
            const [y, m] = mo.split("-").map(Number);
            const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
            const { data } = await supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: "doctor_hour_rate", p_date: last });
            docRates.set(mo, Number(data ?? 0));
        }));
        const actualMin = new Map<string, number>(), planMin = new Map<string, number>();
        (logs || []).forEach(l => {
            const k = `${l.staff_id}|${(l.work_date as string).slice(0, 7)}`;
            const mins = (new Date(l.clock_out as string).getTime() - new Date(l.clock_in as string).getTime()) / 60000;
            if (mins > 0) actualMin.set(k, (actualMin.get(k) || 0) + mins);
        });
        (shifts || []).forEach(s => {
            const k = `${s.doctor_staff_id}|${(s.shift_date as string).slice(0, 7)}`;
            const d = toMin((s.end_time as string).slice(0, 5)) - toMin((s.start_time as string).slice(0, 5));
            if (d > 0) planMin.set(k, (planMin.get(k) || 0) + d);
        });
        const paidMap = new Map((payouts || []).map(p => [`${p.staff_id}|${(p.period_month as string).slice(0, 7)}`, Number(p.time_pay || 0)]));
        const pay = new Map<string, { doctor: number; staff: number }>();
        for (const mo of months) {
            const g = { doctor: 0, staff: 0 };
            for (const s of staff || []) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const prof = Array.isArray((s as any).profiles) ? (s as any).profiles[0] : (s as any).profiles;
                const isDoc = DOCTOR_ROLES.has(String(prof?.role || ""));
                if (!s.is_active && (!s.resigned_on || (s.resigned_on as string) < `${mo}-01`)) continue;
                const k = `${s.id}|${mo}`;
                let tp: number;
                if (paidMap.has(k)) tp = paidMap.get(k)!;
                else if ((s.pay_type || "hourly") === "monthly") tp = Number(s.monthly_salary || 0);
                else {
                    const own = Number(s.hourly_rate || 0);
                    const rate = own === 0 && isDoc ? (docRates.get(mo) || 0) : own;
                    const mins = actualMin.has(k) ? actualMin.get(k)! : (planMin.get(k) || 0);
                    tp = mins / 60 * rate;
                }
                if (isDoc) g.doctor += tp; else g.staff += tp;
            }
            pay.set(mo, g);
        }

        // ── ต้นทุนคงที่ ──
        const { data: fixed } = await supabase.from("fixed_costs").select("category, amount, cycle, start_month, end_month, status").eq("clinic_id", clinicId);

        let cum = 0;
        const rows: MonthRow[] = months.map(mo => {
            const x = M.get(mo) || {};
            const g = (k: string) => Number(x[k] || 0);
            const m1 = `${mo}-01`;
            let fixedActual = 0, fixedMkt = 0, fixedPlanned = 0;
            (fixed || []).forEach(f => {
                if (f.start_month > m1 || (f.end_month && f.end_month < m1)) return;
                const v = f.cycle === "yearly" ? Number(f.amount) / 12 : Number(f.amount);
                if (f.status === "planned") fixedPlanned += v;
                else if (f.category === "marketing") fixedMkt += v;
                else fixedActual += v;
            });
            const c = comm.get(mo) || { doctor: 0, other: 0 };
            const p = pay.get(mo) || { doctor: 0, staff: 0 };
            const breakage = g("breakage_medical") + g("breakage_aesthetic");
            const revMedical = g("rev_medical") + g("course_use_medical") + g("breakage_medical");
            const revAesthetic = g("rev_aesthetic") + g("course_use_aesthetic") + g("breakage_aesthetic");
            const reviewHand = g("review_hand");
            const row: MonthRow = {
                month: mo, revMedical, revAesthetic, revenue: revMedical + revAesthetic,
                courseCash: g("course_cash"), breakage,
                material: g("material"), doctorComp: p.doctor + c.doctor,
                handComm: Math.max(0, c.other - reviewHand) + (teamMap.get(mo) || 0), teamApproved: teamMap.has(mo),
                cardFee: g("card_fee"), staffPay: p.staff, fixed: fixedActual, fixedPlanned,
                waste: g("waste"), marketing: g("ad_spend") + fixedMkt + reviewHand, pettyCash: g("petty_cash"),
                costTotal: 0, profit: 0, cumulative: 0,
            };
            row.costTotal = row.material + row.doctorComp + row.handComm + row.cardFee + row.staffPay + row.fixed + row.waste + row.marketing + row.pettyCash;
            row.profit = row.revenue - row.costTotal;
            cum += row.profit;
            row.cumulative = cum;
            return round(row);
        });

        const totals = emptyRow("รวม");
        rows.forEach(r => {
            (Object.keys(totals) as (keyof MonthRow)[]).forEach(k => {
                if (typeof totals[k] === "number" && k !== "cumulative") (totals[k] as number) += r[k] as number;
            });
        });
        totals.cumulative = cum;
        return { year, rows, totals: round(totals) };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

function emptyRow(month: string): MonthRow {
    return { month, revMedical: 0, revAesthetic: 0, revenue: 0, courseCash: 0, breakage: 0, material: 0, doctorComp: 0, handComm: 0, teamApproved: true,
        cardFee: 0, staffPay: 0, fixed: 0, fixedPlanned: 0, waste: 0, marketing: 0, pettyCash: 0, costTotal: 0, profit: 0, cumulative: 0 };
}
function round(r: MonthRow): MonthRow {
    const o = { ...r };
    (Object.keys(o) as (keyof MonthRow)[]).forEach(k => { if (typeof o[k] === "number") (o[k] as number) = r2(o[k] as number); });
    return o;
}
