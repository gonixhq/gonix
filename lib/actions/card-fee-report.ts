"use server";

import { createClient } from "@/lib/supabase/server";
import { CARD_TYPE_LABEL } from "@/lib/card-fees";

// รายงานค่าธรรมเนียมบัตรรายเดือน (เดือนปฏิทิน) — กระทบยอดกับ statement ร้านค้า
export interface CardFeeGroup { key: string; label: string; count: number; amount: number; fee: number; vat: number; total: number; effectivePct: number }
export interface CardInstallmentRow { paid_at: string; inv_id: string; amount: number; months: number; interestPctMonth: number; customerInterest: number; ref: string | null }
export interface CardFeeReport {
    month: string; from: string; to: string;
    groups: CardFeeGroup[];
    totals: { count: number; amount: number; fee: number; vat: number; total: number; effectivePct: number; cost: number };
    vatEnabled: boolean;
    unspecifiedCount: number;
    refunds: { count: number; amount: number };
    installments: CardInstallmentRow[];
    rows: { paid_at: string; inv_id: string; card: string; amount: number; rate: number | null; fee: number; ref: string | null }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getCardFeeReport(month: string): Promise<CardFeeReport | { error: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "เดือนไม่ถูกต้อง" };
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: "Unauthorized" };
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        const clinicId = profile?.clinic_id as string;
        if (!clinicId) return { error: "ไม่พบคลินิก" };

        const [y, m] = month.split("-").map(Number);
        const from = `${month}-01`;
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
        const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        const startISO = new Date(`${from}T00:00:00+07:00`).toISOString();
        const endISO = new Date(`${nextMonth}T00:00:00+07:00`).toISOString();

        const rowsAll: Record<string, unknown>[] = [];
        for (let start = 0; ; start += 1000) {
            const { data, error } = await supabase.from("payment_logs")
                .select("id, inv_id, amount, paid_at, card_type, card_issuer, installment_months, mdr_rate_pct, card_fee, card_fee_vat, transaction_ref, invoice_headers!inner(status)")
                .eq("clinic_id", clinicId).eq("payment_method", "credit_card")
                .neq("invoice_headers.status", "voided")
                .gte("paid_at", startISO).lt("paid_at", endISO)
                .order("paid_at").range(start, start + 999);
            if (error) return { error: error.message };
            rowsAll.push(...(data || []));
            if ((data || []).length < 1000) break;
        }

        const { data: vatRow } = await supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: "vat_enabled", p_date: last });
        const vatEnabled = Number(vatRow || 0) === 1;

        const groups = new Map<string, CardFeeGroup>();
        let unspecifiedCount = 0;
        const refunds = { count: 0, amount: 0 };
        const installments: CardInstallmentRow[] = [];
        const rows: CardFeeReport["rows"] = [];
        for (const p of rowsAll) {
            const amount = Number(p.amount || 0);
            if (amount < 0) { refunds.count++; refunds.amount = r2(refunds.amount + amount); continue; }
            const issuerK = p.card_issuer === "kbank";
            const key = issuerK ? "kbank" : String(p.card_type || "unspecified");
            if (key === "unspecified") unspecifiedCount++;
            const label = issuerK ? "บัตรกสิกรไทย (ทุกประเภท)" : CARD_TYPE_LABEL[key] || key;
            const fee = Number(p.card_fee || 0), vat = Number(p.card_fee_vat || 0);
            const g = groups.get(key) || { key, label, count: 0, amount: 0, fee: 0, vat: 0, total: 0, effectivePct: 0 };
            g.count++; g.amount = r2(g.amount + amount); g.fee = r2(g.fee + fee); g.vat = r2(g.vat + vat); g.total = r2(g.fee + g.vat);
            groups.set(key, g);
            rows.push({ paid_at: p.paid_at as string, inv_id: p.inv_id as string, card: label, amount, rate: p.mdr_rate_pct != null ? Number(p.mdr_rate_pct) : null, fee: r2(fee + vat), ref: (p.transaction_ref as string) || null });
            if (p.installment_months) {
                const day = new Date(new Date(p.paid_at as string).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
                const { data: ir } = await supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: "installment_interest_pct_month", p_date: day });
                const pct = Number(ir || 0), months = Number(p.installment_months);
                installments.push({ paid_at: p.paid_at as string, inv_id: p.inv_id as string, amount, months, interestPctMonth: pct, customerInterest: r2(amount * pct / 100 * months), ref: (p.transaction_ref as string) || null });
            }
        }
        const list = [...groups.values()].map((g) => ({ ...g, effectivePct: g.amount > 0 ? Math.round(g.total / g.amount * 10000) / 100 : 0 }))
            .sort((a, b) => b.amount - a.amount);
        const t = list.reduce((s, g) => ({ count: s.count + g.count, amount: r2(s.amount + g.amount), fee: r2(s.fee + g.fee), vat: r2(s.vat + g.vat) }), { count: 0, amount: 0, fee: 0, vat: 0 });
        const total = r2(t.fee + t.vat);
        return {
            month, from, to: last, groups: list,
            totals: { ...t, total, effectivePct: t.amount > 0 ? Math.round(total / t.amount * 10000) / 100 : 0, cost: vatEnabled ? t.fee : total },
            vatEnabled, unspecifiedCount, refunds, installments, rows,
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Error" };
    }
}
