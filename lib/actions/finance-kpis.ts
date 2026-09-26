"use server";

import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";
import { getMonthlyReport, type MonthRow } from "./monthly-report";
import { getDeferredRevenue, getExpiringPackagesCount } from "./packages";
import { getTeamCommission } from "./team-commission";

// KPI หน้าแรก (เฟส 5C) — เฉพาะเจ้าของ

export interface FinanceKpis {
    month: string;
    daysElapsed: number; daysInMonth: number;
    revenueToDate: number;
    breakEven: number | null;            // รายได้ที่ต้องทำ/เดือน เพื่อคุ้มทุน
    cmRatio: number | null;              // สัดส่วนกำไรส่วนเกิน (1 − ต้นทุนผันแปร/รายได้)
    fixedBase: number;                   // ต้นทุนคงที่/เดือน (รวมเงินเดือน + ค่าชั่วโมงแพทย์)
    profitToDate: number;
    segMargins: { segment: string; revenue: number; cost: number; margin: number }[];
    lowItems: { name: string; margin: number; revenue: number }[];
    threshold: number;
    customers: { total: number; new: number; returning: number; bills: number; avgBill: number };
    marketingCost: number; cac: number | null;
    courses: { outstanding: number; count: number; expiring30: number };
    team: { base: number; tierPct: number; nextMin: number | null; nextPct: number | null; gap: number | null };
    reserve: { cash: number | null; monthlyFixed: number; months: number | null };
    tax: { ytdProfit: number; projectedProfit: number; ytdTax: number; projectedTax: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** ภาษีเงินได้นิติบุคคล SME (ประมาณการ): 300,000 แรกยกเว้น · 300,001–3,000,000 = 15% · เกิน 3 ล้าน = 20% */
function smeTax(profit: number): number {
    if (profit <= 300000) return 0;
    const t1 = Math.min(profit, 3000000) - 300000;
    const t2 = Math.max(0, profit - 3000000);
    return r2(t1 * 0.15 + t2 * 0.2);
}

export async function getFinanceKpis(): Promise<FinanceKpis | { error: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: "Unauthorized" };
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        const clinicId = profile?.clinic_id as string;
        if (!clinicId) return { error: "ไม่พบคลินิก" };

        const today = bangkokDate();
        const month = today.slice(0, 7);
        const [y, m] = month.split("-").map(Number);
        const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const daysElapsed = Number(today.slice(8, 10));
        const first = `${month}-01`;

        // ── P&L ปีนี้ (+ ปีก่อนถ้าเพิ่งต้นปี เพื่อหาค่าเฉลี่ย 3 เดือนล่าสุด) ──
        const rep = await getMonthlyReport(y);
        if ("error" in rep) return { error: rep.error };
        let hist: MonthRow[] = rep.rows;
        if (hist.length < 4) {
            const prev = await getMonthlyReport(y - 1);
            if (!("error" in prev)) hist = [...prev.rows, ...hist];
        }
        const cur = rep.rows.find(r => r.month === month);
        const done = hist.filter(r => r.month < month && r.revenue > 0).slice(-3);
        // ผันแปร = ยา + ค่ามือ/คอม + ค่าธรรมเนียมบัตร · คงที่ = ที่เหลือ (ค่าตอบแทนแพทย์ เงินเดือน ต้นทุนคงที่ การตลาด ยาทิ้ง รายจ่ายย่อย)
        const variable = (r: MonthRow) => r.material + r.handComm + r.cardFee;
        const sumRev = done.reduce((s, r) => s + r.revenue, 0);
        const sumVar = done.reduce((s, r) => s + variable(r), 0);
        const cmRatio = sumRev > 0 ? 1 - sumVar / sumRev : null;
        const fixedOf = (r: MonthRow) => r.costTotal - variable(r);
        const fixedBase = done.length ? done.reduce((s, r) => s + fixedOf(r), 0) / done.length : (cur ? fixedOf(cur) : 0);
        const breakEven = cmRatio && cmRatio > 0 ? r2(fixedBase / cmRatio) : null;

        // ── มาร์จิ้นแยกหมวด + รายการต่ำกว่าเกณฑ์ (บิลเดือนนี้) ──
        const { data: th } = await supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: "margin_threshold_pct", p_date: today });
        const threshold = Number(th ?? 35);
        const { data: heads } = await supabase.from("invoice_headers").select("id, hn, total_amount, bill_type")
            .eq("clinic_id", clinicId).gte("invoice_date", first).lte("invoice_date", today).not("status", "in", "(voided,refunded)");
        const headMap = new Map((heads || []).map(h => [h.id as string, h]));
        const ids = [...headMap.keys()];
        const items: Record<string, unknown>[] = [];
        for (let i = 0; i < ids.length; i += 200) {
            const { data } = await supabase.from("invoice_items")
                .select("inv_id, item_type, item_name, segment, line_total, discount_amount, cost_material, hand_fee_main, hand_fee_asst, df_pct, performer_staff_id")
                .in("inv_id", ids.slice(i, i + 200));
            items.push(...(data || []));
        }
        const invAfter = new Map<string, number>();
        items.forEach(it => invAfter.set(it.inv_id as string, (invAfter.get(it.inv_id as string) || 0) + Number(it.line_total || 0) - Number(it.discount_amount || 0)));
        const seg = new Map<string, { revenue: number; cost: number }>();
        const byItem = new Map<string, { revenue: number; cost: number }>();
        for (const it of items) {
            if (it.item_type === "package") continue;
            const h = headMap.get(it.inv_id as string);
            const ia = invAfter.get(it.inv_id as string) || 0;
            const rev = ia > 0 ? (Number(it.line_total || 0) - Number(it.discount_amount || 0)) * Number(h?.total_amount || 0) / ia : 0;
            const cost = Number(it.cost_material || 0) + Number(it.hand_fee_main || 0) + Number(it.hand_fee_asst || 0) + (it.performer_staff_id ? rev * Number(it.df_pct || 0) / 100 : 0);
            const sk = (it.segment as string) === "aesthetic" ? "ความงาม" : (it.segment as string) === "product" ? "ขายสินค้า" : "เวชกรรม";
            const g = seg.get(sk) || { revenue: 0, cost: 0 }; g.revenue += rev; g.cost += cost; seg.set(sk, g);
            const b = byItem.get(it.item_name as string) || { revenue: 0, cost: 0 }; b.revenue += rev; b.cost += cost; byItem.set(it.item_name as string, b);
        }
        const pct = (rv: number, c: number) => rv > 0 ? r2((rv - c) / rv * 100) : 0;
        const segMargins = [...seg.entries()].map(([segment, g]) => ({ segment, revenue: r2(g.revenue), cost: r2(g.cost), margin: pct(g.revenue, g.cost) })).sort((a, b) => b.revenue - a.revenue);
        const lowItems = [...byItem.entries()].filter(([, g]) => g.revenue > 0 && pct(g.revenue, g.cost) < threshold)
            .map(([name, g]) => ({ name, margin: pct(g.revenue, g.cost), revenue: r2(g.revenue) })).sort((a, b) => a.margin - b.margin).slice(0, 5);

        // ── ลูกค้าใหม่ / กลับมาซ้ำ / ค่าเฉลี่ยต่อบิล ──
        const hns = [...new Set((heads || []).map(h => h.hn as string).filter(Boolean))];
        let newCount = 0;
        for (let i = 0; i < hns.length; i += 300) {
            const { count } = await supabase.from("patients").select("hn", { count: "exact", head: true })
                .in("hn", hns.slice(i, i + 300)).gte("first_visit_date", first);
            newCount += count || 0;
        }
        const billsTotal = (heads || []).reduce((s, h) => s + Number(h.total_amount || 0), 0);
        const bills = (heads || []).length;

        // ── ต้นทุนต่อลูกค้าใหม่ = การตลาด (แอด + ต้นทุนคงที่การตลาด + ค่ามือเคสรีวิว + ส่วนลดเคสรีวิว) ÷ ลูกค้าใหม่ ──
        const { data: reviewDisc } = await supabase.from("invoice_headers").select("discount_amount")
            .eq("clinic_id", clinicId).eq("bill_type", "review").gte("invoice_date", first).lte("invoice_date", today).not("status", "in", "(voided,refunded)");
        const reviewDiscount = (reviewDisc || []).reduce((s, r) => s + Number(r.discount_amount || 0), 0);
        const marketingCost = r2((cur?.marketing || 0) + reviewDiscount);

        // ── คอร์สค้าง / คอมทีม / เงินสำรอง / ภาษี ──
        const [deferred, expiring, team, cashRes] = await Promise.all([
            getDeferredRevenue(), getExpiringPackagesCount(30), getTeamCommission(month),
            supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: "cash_reserve", p_date: today }),
        ]);
        const teamOk = !("error" in team);
        const cash = cashRes.data == null ? null : Number(cashRes.data);
        const ytdProfit = rep.totals.profit;
        const monthsForProj = rep.rows.length - 1 + daysElapsed / daysInMonth;
        const projectedProfit = monthsForProj > 0 ? r2(ytdProfit / monthsForProj * 12) : ytdProfit;

        return {
            month, daysElapsed, daysInMonth,
            revenueToDate: cur?.revenue || 0, breakEven, cmRatio: cmRatio == null ? null : r2(cmRatio * 100), fixedBase: r2(fixedBase),
            profitToDate: cur?.profit || 0,
            segMargins, lowItems, threshold,
            customers: { total: hns.length, new: newCount, returning: hns.length - newCount, bills, avgBill: bills ? r2(billsTotal / bills) : 0 },
            marketingCost, cac: newCount > 0 ? r2(marketingCost / newCount) : null,
            courses: { outstanding: deferred.outstanding, count: deferred.count, expiring30: expiring.count },
            team: teamOk
                ? { base: team.base, tierPct: team.tierPct, nextMin: team.nextTier?.min ?? null, nextPct: team.nextTier?.pct ?? null, gap: team.nextTier ? r2(team.nextTier.min - team.base) : null }
                : { base: 0, tierPct: 0, nextMin: null, nextPct: null, gap: null },
            reserve: { cash, monthlyFixed: r2(fixedBase), months: cash != null && fixedBase > 0 ? r2(cash / fixedBase) : null },
            tax: { ytdProfit, projectedProfit, ytdTax: smeTax(ytdProfit), projectedTax: smeTax(projectedProfit) },
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}
