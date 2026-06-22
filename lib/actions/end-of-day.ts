"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import { getAnonRevenue } from "./anonymous";
import { getPettyCashTotal } from "./expenses";
import type { EODSummary, PendingVisit, CloseDayHistory } from "@/lib/eod-types";

const r2 = (n: number) => Math.round(n * 100) / 100;
type SB = Awaited<ReturnType<typeof createClient>>;

/** สรุปยอดตามช่องทาง (เงินสด/โอน/บัตร) + รายจ่ายย่อย ของวันที่กำหนด */
async function computePaymentBreakdown(
    supabase: SB, clinicId: string, date: string,
    anonByMethod: { method: string; amount: number; count: number }[],
) {
    const startISO = new Date(`${date}T00:00:00+07:00`).toISOString();
    const next = new Date(`${date}T00:00:00+07:00`); next.setDate(next.getDate() + 1);
    const endISO = next.toISOString();
    const { data: payLogs } = await supabase
        .from("payment_logs").select("payment_method, amount")
        .eq("clinic_id", clinicId).gte("paid_at", startISO).lt("paid_at", endISO);

    const agg: Record<string, { amount: number; count: number }> = {};
    for (const p of payLogs || []) {
        const m = (p.payment_method as string) || "other";
        if (!agg[m]) agg[m] = { amount: 0, count: 0 };
        agg[m].amount += Number(p.amount || 0); agg[m].count += 1;
    }
    for (const m of anonByMethod) {
        const k = m.method || "other";
        if (!agg[k]) agg[k] = { amount: 0, count: 0 };
        agg[k].amount += m.amount; agg[k].count += m.count;
    }
    const grp = (keys: string[]) => keys.reduce(
        (a, k) => ({ amount: a.amount + (agg[k]?.amount || 0), count: a.count + (agg[k]?.count || 0) }),
        { amount: 0, count: 0 });
    const cash = grp(["cash"]);
    const transfer = grp(["transfer", "qr_promptpay"]);
    const credit = grp(["credit_card"]);
    const petty = await getPettyCashTotal(date);
    return {
        cash_received: r2(cash.amount), petty_total: r2(petty),
        transfer_total: r2(transfer.amount), transfer_count: transfer.count,
        credit_total: r2(credit.amount), credit_count: credit.count,
    };
}

/** Get summary of visits/revenue for a given date (default today) */
export async function getEODSummary(date?: string): Promise<EODSummary | { error: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { error: "Profile not found" };

        const targetDate = date || bangkokDate();

        // ── Check ว่าวันนี้ปิดไปแล้วยัง + snapshot stats ──
        const { data: closedRecord } = await supabase
            .from("clinic_day_closes")
            .select("id, closed_at, closed_by, total_visits, total_visits_completed, total_visits_cancelled, total_revenue, vn_last_number, queue_last_number, starting_float, expected_cash, actual_cash, over_short, recon_note, profiles!clinic_day_closes_closed_by_fkey(full_name)")
            .eq("clinic_id", profile.clinic_id)
            .eq("close_date", targetDate)
            .maybeSingle();

        // ── Visit stats ──
        const { data: visits } = await supabase
            .from("visits")
            .select("vn, hn, status, visit_time, patients!inner(prefix, first_name, last_name), queue_entries(queue_number)")
            .eq("clinic_id", profile.clinic_id)
            .eq("visit_date", targetDate);

        const visitList = visits || [];
        const visitsByStatus: Record<string, number> = {};
        for (const v of visitList) {
            visitsByStatus[v.status] = (visitsByStatus[v.status] || 0) + 1;
        }

        // ── Pending visits ──
        const pendingStatuses = ["waiting", "triaged", "with_doctor", "waiting_medicine", "waiting_payment"];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pendingVisits: PendingVisit[] = visitList
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((v: any) => pendingStatuses.includes(v.status))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((v: any) => {
                const p = Array.isArray(v.patients) ? v.patients[0] : v.patients;
                const q = Array.isArray(v.queue_entries) ? v.queue_entries[0] : v.queue_entries;
                return {
                    vn: v.vn,
                    hn: v.hn,
                    patient_name: `${p?.prefix || ""}${p?.first_name || ""} ${p?.last_name || ""}`.trim(),
                    status: v.status,
                    visit_time: v.visit_time,
                    queue_number: q?.queue_number || null,
                };
            });

        // ── Revenue: ยอดที่ชำระจริง (paid_amount) รวมมัดจำ/partial ยกเว้น voided/refunded ──
        //    ใช้ invoice_date + นิยามเดียวกับหน้ารายงาน/RPC ปิดยอด (migration 057)
        const { data: invoices } = await supabase
            .from("invoice_headers")
            .select("paid_amount, status")
            .eq("clinic_id", profile.clinic_id)
            .eq("invoice_date", targetDate);
        const anonRev = await getAnonRevenue(targetDate, targetDate); // + รายรับคลินิกนิรนาม
        const regRevenue = (invoices || [])
            .filter((i) => i.status !== "voided" && i.status !== "refunded")
            .reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
        const totalRevenue = regRevenue + anonRev.total;

        // ── สรุปช่องทางชำระเงิน (cash/transfer/credit) + รายจ่ายย่อย ──
        const breakdown = await computePaymentBreakdown(supabase, profile.clinic_id, targetDate, anonRev.byMethod);

        // เงินทอนตั้งต้นครั้งล่าสุด (pre-fill ช่องกรอก)
        const { data: lastClose } = await supabase
            .from("clinic_day_closes").select("starting_float")
            .eq("clinic_id", profile.clinic_id).not("starting_float", "is", null)
            .order("close_date", { ascending: false }).limit(1).maybeSingle();
        const lastStartingFloat = Number(lastClose?.starting_float || 0);

        // เงินทอนตั้งต้นที่ตั้งไว้ตอนเช้าของวันนี้ (ถ้ามี → เอามาเติมแทน last)
        const { data: openFloat } = await supabase
            .from("clinic_opening_float")
            .select("amount, set_by:staff!clinic_opening_float_set_by_fkey(profiles(full_name))")
            .eq("clinic_id", profile.clinic_id).eq("float_date", targetDate).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ofTyped = openFloat as any;
        const openingFloat = ofTyped ? Number(ofTyped.amount || 0) : null;
        let openingFloatBy: string | null = null;
        if (ofTyped?.set_by) {
            const st = Array.isArray(ofTyped.set_by) ? ofTyped.set_by[0] : ofTyped.set_by;
            const prof = st?.profiles ? (Array.isArray(st.profiles) ? st.profiles[0] : st.profiles) : null;
            openingFloatBy = prof?.full_name || null;
        }

        // ── Counters ──
        const { data: counters } = await supabase
            .from("running_numbers")
            .select("number_type, last_number")
            .eq("clinic_id", profile.clinic_id)
            .in("number_type", ["QUEUE", "VN"]);
        const counterMap = Object.fromEntries((counters || []).map((c) => [c.number_type, c.last_number]));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const closedRecordTyped = closedRecord as any;

        // ถ้าปิดยอดแล้ว → ใช้ snapshot stats จาก close record (ตรงตามที่ปิดยอด)
        // ถ้ายังไม่ได้ปิด → ใช้ live stats ที่คำนวณตอนนี้
        const isClosed = !!closedRecord;
        const finalStats = isClosed && closedRecordTyped ? {
            total_visits: closedRecordTyped.total_visits || 0,
            visits_by_status: {
                completed: closedRecordTyped.total_visits_completed || 0,
                cancelled: closedRecordTyped.total_visits_cancelled || 0,
            } as Record<string, number>,
            // snapshot ไม่ได้รวมยอดนิรนาม → บวกเพิ่มตอนอ่าน
            total_revenue: (Number(closedRecordTyped.total_revenue) || 0) + anonRev.total,
        } : {
            total_visits: visitList.length,
            visits_by_status: visitsByStatus,
            total_revenue: totalRevenue,
        };

        // จำนวนเคสนิรนามที่จ่ายเงินวันนั้น (นับจากยอดรายรับนิรนาม)
        const anonCount = anonRev.byMethod.reduce((s, m) => s + m.count, 0);

        return {
            close_date: targetDate,
            total_visits: finalStats.total_visits,
            visits_by_status: finalStats.visits_by_status,
            total_revenue: finalStats.total_revenue,
            anon_count: anonCount,
            anon_revenue: anonRev.total,
            cash_received: breakdown.cash_received,
            petty_total: breakdown.petty_total,
            transfer_total: breakdown.transfer_total,
            transfer_count: breakdown.transfer_count,
            credit_total: breakdown.credit_total,
            credit_count: breakdown.credit_count,
            last_starting_float: lastStartingFloat,
            opening_float: openingFloat,
            opening_float_by: openingFloatBy,
            closed_recon: isClosed && closedRecordTyped ? {
                starting_float: Number(closedRecordTyped.starting_float || 0),
                expected_cash: Number(closedRecordTyped.expected_cash || 0),
                actual_cash: closedRecordTyped.actual_cash != null ? Number(closedRecordTyped.actual_cash) : null,
                over_short: Number(closedRecordTyped.over_short || 0),
                recon_note: closedRecordTyped.recon_note || null,
            } : undefined,
            pending_visits: pendingVisits,
            queue_last_number: counterMap["QUEUE"] || 0,
            vn_last_number: counterMap["VN"] || 0,
            already_closed: isClosed,
            closed_record: closedRecordTyped
                ? {
                    id: closedRecordTyped.id,
                    closed_at: closedRecordTyped.closed_at,
                    closed_by_name: Array.isArray(closedRecordTyped.profiles)
                        ? closedRecordTyped.profiles[0]?.full_name || null
                        : closedRecordTyped.profiles?.full_name || null,
                }
                : undefined,
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Error" };
    }
}

/** Close the clinic day — resets counters and snapshots summary + cash reconciliation */
export async function closeClinicDay(input: {
    date?: string; notes?: string;
    startingFloat?: number; actualCash?: number | null; reconNote?: string;
}) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const targetDate = input.date || bangkokDate();

        // ── Call atomic RPC ──
        const { data: closeId, error } = await supabase.rpc("fn_close_clinic_day", {
            p_clinic_id: profile.clinic_id,
            p_close_date: targetDate,
            p_closed_by: user.id,
            p_notes: input.notes || null,
        });

        if (error) {
            const msg = error.message || "";
            if (msg.includes("PENDING_VISITS:")) {
                const count = msg.match(/PENDING_VISITS:(\d+)/)?.[1] || "?";
                return { success: false, error: `มี Visit ค้างอยู่ ${count} รายการ — กรุณาจัดการให้เสร็จก่อนปิดยอด` };
            }
            if (msg.includes("ALREADY_CLOSED")) {
                return { success: false, error: "วันนี้ปิดยอดไปแล้ว" };
            }
            return { success: false, error: error.message };
        }

        // ── Snapshot การกระทบเงินสด/ช่องทาง ลงใน close record ──
        try {
            const anon = await getAnonRevenue(targetDate, targetDate);
            const bd = await computePaymentBreakdown(supabase, profile.clinic_id, targetDate, anon.byMethod);
            const startingFloat = Number(input.startingFloat || 0);
            const expectedCash = r2(startingFloat + bd.cash_received - bd.petty_total);
            const actualCash = input.actualCash != null && input.actualCash !== undefined ? Number(input.actualCash) : null;
            const overShort = actualCash != null ? r2(actualCash - expectedCash) : 0;
            await supabase.from("clinic_day_closes").update({
                starting_float: startingFloat,
                cash_received: bd.cash_received,
                petty_total: bd.petty_total,
                expected_cash: expectedCash,
                actual_cash: actualCash,
                over_short: overShort,
                transfer_total: bd.transfer_total,
                transfer_count: bd.transfer_count,
                credit_total: bd.credit_total,
                credit_count: bd.credit_count,
                recon_note: input.reconNote?.trim() || null,
            }).eq("clinic_id", profile.clinic_id).eq("close_date", targetDate);
        } catch { /* recon เป็นข้อมูลเสริม — ปิดยอดสำเร็จแล้วถึงจะ snapshot ไม่ได้ก็ไม่ rollback */ }

        revalidatePath("/dashboard/eod");
        revalidatePath("/dashboard/overview");
        return { success: true, closeId };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ยกเลิกการปิดยอด (เปิดวันใหม่) — ใช้แก้กรณีปิดผิด/ปิดก่อนยอดครบ */
export async function reopenClinicDay(date: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { error } = await supabase.rpc("fn_reopen_clinic_day", {
            p_clinic_id: profile.clinic_id,
            p_close_date: date,
        });

        if (error) {
            if ((error.message || "").includes("NOT_CLOSED")) {
                return { success: false, error: "วันนี้ยังไม่ได้ปิดยอด" };
            }
            return { success: false, error: error.message };
        }

        revalidatePath("/dashboard/eod");
        revalidatePath("/dashboard/overview");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ตั้ง/แก้ เงินทอนตั้งต้นของวัน (ตอนเปิดร้าน) — upsert ต่อ คลินิก-วัน */
export async function setOpeningFloat(date: string, amount: number) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const amt = Number(amount);
        if (amt < 0 || isNaN(amt)) return { success: false, error: "จำนวนเงินไม่ถูกต้อง" };

        const { data: staffRow } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();

        const { error } = await supabase.from("clinic_opening_float").upsert({
            clinic_id: profile.clinic_id,
            float_date: date,
            amount: amt,
            set_by: staffRow?.id || null,
            set_at: new Date().toISOString(),
        }, { onConflict: "clinic_id,float_date" });
        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/eod");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** History of past day closes */
export async function getCloseDayHistory(limit = 30): Promise<CloseDayHistory[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("clinic_day_closes")
            .select(`
                id, close_date, closed_at, total_visits, total_visits_completed,
                total_visits_cancelled, total_revenue, vn_last_number, queue_last_number, notes,
                profiles!clinic_day_closes_closed_by_fkey(full_name)
            `)
            .eq("clinic_id", profile.clinic_id)
            .order("close_date", { ascending: false })
            .limit(limit);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = ((data || []) as any[]).map((r) => ({
            id: r.id,
            close_date: r.close_date as string,
            closed_at: r.closed_at,
            closed_by_name: Array.isArray(r.profiles) ? r.profiles[0]?.full_name || null : r.profiles?.full_name || null,
            total_visits: r.total_visits,
            total_visits_completed: r.total_visits_completed,
            total_visits_cancelled: r.total_visits_cancelled,
            total_revenue: Number(r.total_revenue),
            vn_last_number: r.vn_last_number,
            queue_last_number: r.queue_last_number,
            notes: r.notes,
        }));

        // รวมยอดคลินิกนิรนามต่อวัน ให้ตรงกับการ์ดสรุปด้านบน (snapshot ไม่ได้เก็บยอดนิรนาม)
        if (rows.length > 0) {
            const dates = rows.map((r) => r.close_date).sort();
            const anon = await getAnonRevenue(dates[0], dates[dates.length - 1]);
            const anonByDay = Object.fromEntries(anon.byDay.map((d) => [d.date, d.amount]));
            for (const r of rows) {
                r.total_revenue = Math.round((r.total_revenue + (anonByDay[r.close_date] || 0)) * 100) / 100;
            }
        }
        return rows;
    } catch {
        return [];
    }
}

