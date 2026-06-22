"use server";

import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";
import { getAnonRevenue } from "./anonymous";
import { fallbackSegment } from "@/lib/segments";

/** รายได้แยกตามแผนก (medical/aesthetic/product) ของช่วงวันที่ — prorate ตามที่ชำระจริง */
export async function getSegmentRevenue(startDate?: string, endDate?: string): Promise<{ segment: string; amount: number }[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const start = startDate || bangkokDate();
        const end = endDate || start;

        // invoice ที่ไม่ voided/refunded ในช่วง → เก็บ factor (paid/total) ไว้ prorate
        const { data: invs } = await supabase
            .from("invoice_headers")
            .select("id, status, total_amount, paid_amount")
            .eq("clinic_id", profile.clinic_id)
            .gte("invoice_date", start).lte("invoice_date", end);

        const factorMap: Record<string, number> = {};
        for (const i of invs || []) {
            if (i.status === "voided" || i.status === "refunded") continue;
            const total = Number(i.total_amount || 0);
            const paid = Number(i.paid_amount || 0);
            factorMap[i.id as string] = total > 0 ? Math.min(paid / total, 1) : (paid > 0 ? 1 : 0);
        }
        const validIds = Object.keys(factorMap);

        const totals: Record<string, number> = { medical: 0, aesthetic: 0, product: 0 };
        if (validIds.length > 0) {
            const { data: items } = await supabase
                .from("invoice_items")
                .select("inv_id, item_type, segment, line_total")
                .in("inv_id", validIds);
            for (const it of items || []) {
                const seg = (it.segment as string) || fallbackSegment(it.item_type as string);
                const factor = factorMap[it.inv_id as string] ?? 1;
                totals[seg] = (totals[seg] || 0) + Number(it.line_total || 0) * factor;
            }
        }

        // คลินิกนิรนาม (ตรวจ STD) → การแพทย์
        const anon = await getAnonRevenue(start, end);
        totals.medical += anon.total;

        return Object.entries(totals).map(([segment, amount]) => ({ segment, amount: Math.round(amount * 100) / 100 }));
    } catch {
        return [];
    }
}
