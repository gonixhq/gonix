"use server";

import { createClient } from "@/lib/supabase/server";
import { pushLineText } from "@/lib/line";

const EXCLUDE = new Set(["voided", "refunded", "draft"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, line_user_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string, lineUserId: (profile.line_user_id as string) || null };
}

export interface SalesForecast {
    monthly: { month: string; revenue: number }[];  // ย้อนหลัง (เดือนสมบูรณ์)
    nextMonth: string;
    nextMonthLabel: string;
    predicted: number;
    method: string;
    hasData: boolean;
}

/** พยากรณ์ยอดขายเดือนถัดไป — heuristic: เฉลี่ย 3 เดือนล่าสุด ผสมเดือนเดียวกันปีก่อน (seasonality) */
export async function getSalesForecast(): Promise<SalesForecast> {
    const empty: SalesForecast = { monthly: [], nextMonth: "", nextMonthLabel: "", predicted: 0, method: "", hasData: false };
    try {
        const { supabase, clinicId } = await getCtx();
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 13, 1);
        const startStr = start.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
        const { data } = await supabase.from("invoice_headers")
            .select("invoice_date, paid_amount, status").eq("clinic_id", clinicId).gte("invoice_date", startStr);

        const byMonth: Record<string, number> = {};
        for (const i of data || []) {
            if (EXCLUDE.has(i.status as string)) continue;
            const mk = (i.invoice_date as string).slice(0, 7);
            byMonth[mk] = (byMonth[mk] || 0) + Number(i.paid_amount || 0);
        }
        const curMonth = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(0, 7);
        // เดือนสมบูรณ์ = ไม่รวมเดือนปัจจุบัน
        const monthly = Object.entries(byMonth).filter(([m]) => m < curMonth)
            .map(([month, revenue]) => ({ month, revenue: r2(revenue) })).sort((a, b) => a.month.localeCompare(b.month));
        if (monthly.length === 0) return { ...empty };

        // เดือนถัดไป
        const [cy, cm] = curMonth.split("-").map(Number);
        const nd = new Date(cy, cm - 1 + 1, 1); // เดือนถัดจากเดือนปัจจุบัน
        const nextMonth = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`;
        const nextMonthLabel = nd.toLocaleDateString("th-TH", { year: "numeric", month: "long" });

        const recent = monthly.slice(-3);
        const recentAvg = recent.reduce((s, m) => s + m.revenue, 0) / recent.length;
        const lyKey = `${nd.getFullYear() - 1}-${String(nd.getMonth() + 1).padStart(2, "0")}`;
        const lySame = byMonth[lyKey];
        let predicted: number, method: string;
        if (lySame && lySame > 0) {
            predicted = r2((recentAvg + lySame) / 2);
            method = "เฉลี่ย 3 เดือนล่าสุด + เดือนเดียวกันปีก่อน (seasonality)";
        } else {
            predicted = r2(recentAvg);
            method = `เฉลี่ย ${recent.length} เดือนล่าสุด`;
        }
        return { monthly, nextMonth, nextMonthLabel, predicted, method, hasData: true };
    } catch {
        return empty;
    }
}

/** ส่งสรุปผู้บริหารเข้า LINE ของผู้ใช้ปัจจุบัน (manual trigger; auto/cron ค่อยต่อภายหลัง) */
export async function sendExecSummaryToMyLine(text: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { lineUserId } = await getCtx();
        if (!lineUserId) return { success: false, error: "บัญชีคุณยังไม่ได้ผูก LINE (ตั้งค่าที่โปรไฟล์)" };
        const r = await pushLineText(lineUserId, text);
        if (!r.ok) return { success: false, error: r.error || "ส่ง LINE ไม่สำเร็จ" };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
