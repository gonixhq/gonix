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

export interface VoidPatternRow {
    name: string; voids: number; refunds: number; total: number; isOutlier: boolean;
}

/**
 * ตรวจจับพนักงานที่ยกเลิก/คืนเงินบ่อยผิดปกติ (จาก audit_logs 90 วันล่าสุด)
 * เกณฑ์ outlier: ทำ ≥3 ครั้ง และมากกว่าค่าเฉลี่ยของทีม 2 เท่าขึ้นไป
 */
export async function getVoidRefundPattern(): Promise<VoidPatternRow[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const since = new Date(Date.now() - 90 * 86400000).toISOString();
        const { data: logs } = await supabase
            .from("audit_logs")
            .select("action, performed_by, profiles!audit_logs_performed_by_fkey(full_name)")
            .eq("clinic_id", profile.clinic_id)
            .eq("table_name", "invoice_headers")
            .in("action", ["void", "refund"])
            .gte("performed_at", since)
            .limit(1000);

        const map: Record<string, VoidPatternRow> = {};
        for (const l of logs || []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ll = l as any;
            const id = ll.performed_by as string;
            if (!id) continue;
            const prof = Array.isArray(ll.profiles) ? ll.profiles[0] : ll.profiles;
            if (!map[id]) map[id] = { name: prof?.full_name || "—", voids: 0, refunds: 0, total: 0, isOutlier: false };
            if (ll.action === "void") map[id].voids++; else map[id].refunds++;
            map[id].total++;
        }

        const rows = Object.values(map);
        if (rows.length === 0) return [];
        const avg = rows.reduce((s, r) => s + r.total, 0) / rows.length;
        return rows
            .map((r) => ({ ...r, isOutlier: r.total >= 3 && r.total >= avg * 2 }))
            .sort((a, b) => b.total - a.total);
    } catch {
        return [];
    }
}
