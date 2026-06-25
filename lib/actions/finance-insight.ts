"use server";

import { createClient } from "@/lib/supabase/server";
import { getLoyaltySnapshot } from "./loyalty";

/** Customer Lifetime Value — ยอดใช้จ่ายสะสมทั้งหมดของผู้ป่วย + แต้มสะสม */
export async function getPatientLifetime(hn: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return null;

        const { data: invs } = await supabase
            .from("invoice_headers")
            .select("paid_amount, status, invoice_date, vn")
            .eq("clinic_id", profile.clinic_id).eq("hn", hn);
        const valid = (invs || []).filter((i) => i.status !== "voided" && i.status !== "refunded");
        const total = valid.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
        const vns = new Set(valid.map((i) => i.vn).filter(Boolean));
        const dates = valid.map((i) => i.invoice_date as string).filter(Boolean).sort();

        const { data: pt } = await supabase.from("patients").select("prefix, first_name, last_name").eq("hn", hn).maybeSingle();
        const name = pt ? `${pt.prefix || ""}${pt.first_name || ""} ${pt.last_name || ""}`.trim() : hn;

        // แต้มสะสม (ถ้ามีระบบ loyalty)
        let points: number | null = null, tierName: string | null = null;
        try {
            const loy = await getLoyaltySnapshot(hn);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const l = loy as any;
            if (l) { points = Number(l.balance ?? l.points ?? 0); tierName = l.tierName || l.name || null; }
        } catch { /* ไม่มี loyalty */ }

        return {
            hn, name,
            total: Math.round(total * 100) / 100,
            invoiceCount: valid.length,
            visitCount: vns.size,
            firstDate: dates[0] || null,
            lastDate: dates[dates.length - 1] || null,
            points, tierName,
        };
    } catch {
        return null;
    }
}

export interface StaffReconRow {
    name: string; closes: number; shortCount: number; netOverShort: number; shortRate: number;
}

/** วิเคราะห์รูปแบบเงินขาด/เกินรายพนักงาน (จาก clinic_day_closes ที่นับเงินจริง) */
export async function getStaffReconPattern(): Promise<StaffReconRow[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data: closes } = await supabase
            .from("clinic_day_closes")
            .select("closed_by, over_short, actual_cash, profiles!clinic_day_closes_closed_by_fkey(full_name)")
            .eq("clinic_id", profile.clinic_id)
            .not("actual_cash", "is", null)
            .order("close_date", { ascending: false }).limit(300);

        const map: Record<string, StaffReconRow> = {};
        for (const c of closes || []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cc = c as any;
            const id = cc.closed_by as string;
            if (!id) continue;
            const prof = Array.isArray(cc.profiles) ? cc.profiles[0] : cc.profiles;
            const name = prof?.full_name || "—";
            if (!map[id]) map[id] = { name, closes: 0, shortCount: 0, netOverShort: 0, shortRate: 0 };
            map[id].closes++;
            const os = Number(cc.over_short || 0);
            map[id].netOverShort += os;
            if (os < -0.01) map[id].shortCount++;
        }
        return Object.values(map)
            .map((s) => ({ ...s, netOverShort: Math.round(s.netOverShort * 100) / 100, shortRate: s.closes ? s.shortCount / s.closes : 0 }))
            .sort((a, b) => a.netOverShort - b.netOverShort);
    } catch {
        return [];
    }
}
