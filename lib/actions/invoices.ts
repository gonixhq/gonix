"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isDayClosed, DAY_LOCKED_MSG } from "@/lib/eod-lock";
import { generateFollowUpTasks } from "./follow-up";
import { restoreFEFO, deductFEFO } from "@/lib/inventory-fefo";

/** Log invoice action to audit_logs */
async function logInvoiceAction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    {
        clinicId, invId, action, reason, oldStatus, newStatus, userId,
    }: {
        clinicId: string;
        invId: string;
        action: "void" | "refund";
        reason: string;
        oldStatus: string;
        newStatus: string;
        userId: string;
    }
) {
    try {
        await supabase.from("audit_logs").insert({
            clinic_id: clinicId,
            table_name: "invoice_headers",
            record_id: invId,
            action,
            old_data: { status: oldStatus },
            new_data: { status: newStatus, reason },
            performed_by: userId,
        });
    } catch {
        // Non-blocking — audit log failure shouldn't prevent the main action
    }
}

/** คืนสต๊อกที่ตัดไปตอน checkout กลับเข้าคลัง (ใช้ตอน void) — mirror 3 เส้นทางที่ตัด
 *  ยา(drug_orders)/service kit(service_catalog)/ของฉีด(vial_usage) · best-effort ไม่ block การ void */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restoreInvoiceStock(supabase: any, invId: string, clinicId: string, vn: string | null) {
    try {
        const { data: items } = await supabase.from("invoice_items")
            .select("item_type, item_ref_id, qty").eq("inv_id", invId);
        if (!items || items.length === 0) return;
        const now = new Date().toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = items as any[];

        // 1. ยา (item_type='drug' · item_ref_id = drug_order.id → item_id)
        const drugRefs = rows.filter(i => i.item_type === "drug" && i.item_ref_id);
        if (drugRefs.length) {
            const { data: orders } = await supabase.from("drug_orders")
                .select("id, item_id").in("id", drugRefs.map(i => i.item_ref_id));
            const orderMap = new Map((orders || []).map((o: { id: string; item_id: string }) => [o.id, o.item_id]));
            for (const it of drugRefs) {
                const itemId = orderMap.get(it.item_ref_id) as string | undefined;
                const qty = Number(it.qty) || 0;
                if (!itemId || qty <= 0) continue;
                const { data: inv } = await supabase.from("inventory").select("stock_qty").eq("id", itemId).maybeSingle();
                if (!inv) continue;
                const bal = Number(inv.stock_qty || 0) + qty;
                await supabase.from("inventory").update({ stock_qty: bal, updated_at: now }).eq("id", itemId);
                await restoreFEFO(supabase, clinicId, itemId, qty);
                await supabase.from("stock_card").insert({
                    item_id: itemId, clinic_id: clinicId, tx_type: "RETURN_FROM_PATIENT",
                    qty_delta: qty, balance_after: bal, note: `คืนจากยกเลิกบิล (${invId})`,
                });
            }
        }

        // 2. service kit (item_type='service' · item_ref_id = service_catalog.id → inventory_item_id × consume_qty)
        const svcRefs = rows.filter(i => i.item_type === "service" && i.item_ref_id);
        if (svcRefs.length) {
            const svcIds = [...new Set(svcRefs.map(i => i.item_ref_id))];
            const { data: svcs } = await supabase.from("service_catalog")
                .select("id, inventory_item_id, consume_qty").eq("clinic_id", clinicId)
                .in("id", svcIds).not("inventory_item_id", "is", null);
            const svcMap = new Map((svcs || []).map((s: { id: string; inventory_item_id: string; consume_qty: number }) =>
                [s.id, { inv: s.inventory_item_id, qty: Number(s.consume_qty) || 1 }]));
            for (const it of svcRefs) {
                const cfg = svcMap.get(it.item_ref_id) as { inv: string; qty: number } | undefined;
                if (!cfg) continue;
                const restore = cfg.qty * Math.max(1, Number(it.qty || 1));
                const { data: inv } = await supabase.from("inventory").select("stock_qty").eq("id", cfg.inv).maybeSingle();
                if (!inv) continue;
                const bal = Number(inv.stock_qty || 0) + restore;
                await supabase.from("inventory").update({ stock_qty: bal, updated_at: now }).eq("id", cfg.inv);
                await restoreFEFO(supabase, clinicId, cfg.inv, restore);
                await supabase.from("stock_card").insert({
                    item_id: cfg.inv, clinic_id: clinicId, tx_type: "RETURN_FROM_PATIENT",
                    qty_delta: restore, balance_after: bal, note: `คืนจากยกเลิกบิล-บริการ (${invId})`,
                });
            }
        }

        // 3. ของฉีด (vial model B) — คืนความจุกลับ vial ที่ใช้จริง (vial_usage ราย vn) แล้ว sync
        if (vn && rows.some(i => i.item_type === "injectable")) {
            const { data: usage } = await supabase.from("vial_usage")
                .select("id, item_id, vial_id, qty").eq("vn", vn).eq("clinic_id", clinicId);
            const touched = new Set<string>();
            for (const u of usage || []) {
                if (u.vial_id) {
                    const { data: vial } = await supabase.from("inventory_vials")
                        .select("capacity_total, capacity_remaining").eq("id", u.vial_id).maybeSingle();
                    if (vial) {
                        const cap = Number(vial.capacity_total) || 0;
                        const rem = Math.min(cap, Number(vial.capacity_remaining || 0) + Number(u.qty || 0));
                        await supabase.from("inventory_vials")
                            .update({ capacity_remaining: rem, status: rem >= cap ? "unopened" : "open" })
                            .eq("id", u.vial_id);
                    }
                }
                touched.add(u.item_id as string);
            }
            // การฉีดถูกยกเลิก → ลบ recall + sync stock_qty จาก vial
            await supabase.from("vial_usage").delete().eq("vn", vn).eq("clinic_id", clinicId);
            for (const itemId of touched) await supabase.rpc("fn_sync_vial_stock", { p_item: itemId });
        }

        revalidatePath("/dashboard/inventory");
    } catch (e) {
        console.warn("[void] restore stock failed:", e);
    }
}

/** Void invoice (ยกเลิกใบเสร็จ) — ใครก็ทำได้ แต่ต้องบันทึกเหตุผล + audit log */
export async function voidInvoice(invId: string, reason?: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // Require reason
        const reasonText = (reason || "").trim();
        if (!reasonText) return { success: false, error: "กรุณาระบุเหตุผลในการยกเลิก" };
        if (reasonText.length < 5) return { success: false, error: "เหตุผลสั้นเกินไป (ต้องอย่างน้อย 5 ตัวอักษร)" };

        // Check current status
        const { data: inv } = await supabase
            .from("invoice_headers").select("status, vn, clinic_id, invoice_date").eq("id", invId).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (inv.status === "voided") return { success: false, error: "ใบเสร็จนี้ยกเลิกแล้ว" };
        if (inv.status === "refunded") return { success: false, error: "ใบเสร็จนี้คืนเงินไปแล้ว" };
        if (await isDayClosed(supabase, inv.clinic_id, inv.invoice_date)) return { success: false, error: DAY_LOCKED_MSG };

        // Update status
        const { error } = await supabase
            .from("invoice_headers")
            .update({
                status: "voided",
                updated_at: new Date().toISOString(),
            })
            .eq("id", invId);

        if (error) return { success: false, error: error.message };

        // คืนสต๊อกที่ตัดไปตอน checkout กลับเข้าคลัง (ยา/service kit/ของฉีด vial)
        // — รันครั้งเดียวเสมอ เพราะด้านบน block ถ้า status=voided แล้ว
        await restoreInvoiceStock(supabase, invId, inv.clinic_id, inv.vn as string | null);

        // Audit log — always record who did this + reason
        await logInvoiceAction(supabase, {
            clinicId: inv.clinic_id,
            invId,
            action: "void",
            reason: reasonText,
            oldStatus: inv.status,
            newStatus: "voided",
            userId: user.id,
        });

        revalidatePath("/dashboard/finance");
        revalidatePath(`/dashboard/finance/${invId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Refund invoice (คืนเงินใบเสร็จ) — ใครก็ทำได้ แต่ต้องบันทึกเหตุผล + audit log */
export async function refundInvoice(invId: string, reason?: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // Require reason
        const reasonText = (reason || "").trim();
        if (!reasonText) return { success: false, error: "กรุณาระบุเหตุผลในการคืนเงิน" };
        if (reasonText.length < 5) return { success: false, error: "เหตุผลสั้นเกินไป (ต้องอย่างน้อย 5 ตัวอักษร)" };

        const { data: inv } = await supabase
            .from("invoice_headers")
            .select("status, total_amount, paid_amount, clinic_id, invoice_date")
            .eq("id", invId).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (inv.status !== "paid") return { success: false, error: "ใบเสร็จยังไม่ได้ชำระเงิน — ใช้ยกเลิกแทน" };
        if (await isDayClosed(supabase, inv.clinic_id, inv.invoice_date)) return { success: false, error: DAY_LOCKED_MSG };

        // Update status to refunded
        const { error } = await supabase
            .from("invoice_headers")
            .update({
                status: "refunded",
                updated_at: new Date().toISOString(),
            })
            .eq("id", invId);

        if (error) return { success: false, error: error.message };

        // Insert negative payment log for refund tracking
        if (inv.clinic_id) {
            await supabase.from("payment_logs").insert({
                inv_id: invId,
                clinic_id: inv.clinic_id,
                payment_method: "cash",
                amount: -Number(inv.paid_amount || inv.total_amount || 0),
                transaction_ref: `REFUND: ${reasonText}`,
            });
        }

        // Audit log
        await logInvoiceAction(supabase, {
            clinicId: inv.clinic_id,
            invId,
            action: "refund",
            reason: reasonText,
            oldStatus: inv.status,
            newStatus: "refunded",
            userId: user.id,
        });

        revalidatePath("/dashboard/finance");
        revalidatePath(`/dashboard/finance/${invId}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** รับชำระเพิ่ม (สำหรับใบที่มัดจำ/ค้างชำระ) */
export async function addPayment(input: {
    invId: string;
    amount: number;
    paymentMethod: "cash" | "transfer" | "credit_card" | "qr_promptpay";
    note?: string;
    bankName?: string;
    transactionRef?: string;
    card?: CardInput;
}) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const amount = Number(input.amount);
        if (!amount || amount <= 0) return { success: false, error: "ยอดต้องมากกว่า 0" };

        // Fetch invoice
        const { data: inv } = await supabase
            .from("invoice_headers")
            .select("id, clinic_id, total_amount, paid_amount, status, invoice_date")
            .eq("id", input.invId).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (["voided", "refunded"].includes(inv.status)) {
            return { success: false, error: "ใบเสร็จนี้ปิดแล้ว ไม่สามารถรับชำระเพิ่ม" };
        }
        if (await isDayClosed(supabase, inv.clinic_id, inv.invoice_date)) return { success: false, error: DAY_LOCKED_MSG };

        const oldPaid = Number(inv.paid_amount || 0);
        const total = Number(inv.total_amount || 0);
        const newPaid = oldPaid + amount;
        const balance = total - newPaid;

        // Insert payment log
        const { error: payErr } = await supabase.from("payment_logs").insert({
            inv_id: input.invId,
            clinic_id: inv.clinic_id,
            payment_method: input.paymentMethod,
            amount,
            bank_name: input.bankName || null,
            transaction_ref: input.transactionRef || null,
            note: input.note || null,
            received_by: null,
            ...cardColumns(input.paymentMethod, input.card),
        });
        if (payErr) return { success: false, error: `Payment log: ${payErr.message}` };

        // Update invoice header
        const newStatus = newPaid >= total ? "paid" : newPaid > 0 ? "partial" : "issued";
        const { error: upErr } = await supabase
            .from("invoice_headers")
            .update({
                paid_amount: newPaid,
                status: newStatus,
                updated_at: new Date().toISOString(),
            })
            .eq("id", input.invId);
        if (upErr) return { success: false, error: upErr.message };

        // ชำระครบ → สร้าง task ติดตามผลอัตโนมัติ (non-blocking — ไม่ให้กระทบการจ่ายเงิน)
        if (newStatus === "paid") {
            try { await generateFollowUpTasks(input.invId); } catch { /* ignore */ }
        }

        revalidatePath("/dashboard/finance");
        revalidatePath(`/dashboard/finance/${input.invId}`);
        return { success: true, newPaid, balance, newStatus };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

// ตรงกับ enum payment_method ใน DB (ไม่มี debit_card — เดบิตเป็น "ประเภทบัตร" ของ credit_card)
const PAY_METHODS = new Set(["cash", "transfer", "credit_card", "qr_promptpay"]);
const PM_LABEL: Record<string, string> = {
    cash: "เงินสด", transfer: "โอน/QR", credit_card: "บัตร", qr_promptpay: "QR/พร้อมเพย์",
};

export type CardInput = { card_type?: string; card_issuer?: string; installment_months?: number | null };
const CARD_TYPE_SET = new Set(["debit_domestic", "credit_domestic", "credit_domestic_premium", "foreign", "foreign_premium"]);

/** คอลัมน์บัตรสำหรับ payment_logs — DB trigger (mig 140) คิด MDR/ค่าธรรมเนียม snapshot เอง */
function cardColumns(method: string, card?: CardInput) {
    if (method !== "credit_card") return { card_type: null, card_issuer: null, installment_months: null };
    const issuer = card?.card_issuer === "kbank" ? "kbank" : "other";
    const months = issuer === "kbank" && [3, 6, 10].includes(Number(card?.installment_months)) ? Number(card?.installment_months) : null;
    return { card_type: card?.card_type && CARD_TYPE_SET.has(card.card_type) ? card.card_type : "unspecified", card_issuer: issuer, installment_months: months };
}

/** เปลี่ยนวิธีชำระของรายการชำระ (payment_logs) เช่น เงินสด→โอน — เก็บ audit + เคารพล็อกปิดยอด */
export async function changePaymentMethod(paymentId: string, newMethod: string, card?: CardInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };
        if (!PAY_METHODS.has(newMethod)) return { success: false, error: "วิธีชำระไม่ถูกต้อง" };

        const { data: pay } = await supabase.from("payment_logs")
            .select("id, inv_id, clinic_id, payment_method, amount, card_type, card_issuer, installment_months").eq("id", paymentId).single();
        if (!pay) return { success: false, error: "ไม่พบรายการชำระ" };
        if (Number(pay.amount) < 0) return { success: false, error: "แก้ไขรายการคืนเงินไม่ได้" };
        const oldMethod = (pay.payment_method as string) || "";
        const cols = cardColumns(newMethod, card);
        if (newMethod === "credit_card" && cols.card_type === "unspecified") return { success: false, error: "กรุณาเลือกประเภทบัตร" };
        const sameCard = cols.card_type === (pay.card_type ?? null) && cols.card_issuer === (pay.card_issuer ?? null)
            && cols.installment_months === (pay.installment_months ?? null);
        if (oldMethod === newMethod && sameCard) return { success: true };

        const { data: inv } = await supabase.from("invoice_headers")
            .select("status, invoice_date, clinic_id").eq("id", pay.inv_id).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (["voided", "refunded"].includes(inv.status)) return { success: false, error: "ใบเสร็จนี้ปิดแล้ว แก้ไขวิธีชำระไม่ได้" };
        if (await isDayClosed(supabase, inv.clinic_id, inv.invoice_date)) return { success: false, error: DAY_LOCKED_MSG };

        const { error: upErr } = await supabase.from("payment_logs")
            .update({ payment_method: newMethod, ...cols }).eq("id", paymentId);
        if (upErr) return { success: false, error: upErr.message };

        try {
            await supabase.from("audit_logs").insert({
                clinic_id: inv.clinic_id,
                table_name: "invoice_headers",
                record_id: pay.inv_id,
                action: "payment_method_change",
                old_data: { payment_method: oldMethod, card_type: pay.card_type ?? null, card_issuer: pay.card_issuer ?? null },
                new_data: {
                    payment_id: paymentId, payment_method: newMethod, card_type: cols.card_type, card_issuer: cols.card_issuer,
                    reason: `เปลี่ยนวิธีชำระ: ${PM_LABEL[oldMethod] || oldMethod} → ${PM_LABEL[newMethod] || newMethod}`,
                },
                performed_by: user.id,
            });
        } catch { /* audit best-effort */ }

        revalidatePath("/dashboard/finance");
        revalidatePath(`/dashboard/finance/${pay.inv_id}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ตัดสต๊อกกลับ (mirror ของ restoreInvoiceStock) — ใช้ตอน "กู้คืนบิล" (unvoid) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deductInvoiceStock(supabase: any, invId: string, clinicId: string, vn: string | null): Promise<string | null> {
    let warn: string | null = null;
    try {
        const { data: items } = await supabase.from("invoice_items")
            .select("item_type, item_ref_id, qty").eq("inv_id", invId);
        if (!items || items.length === 0) return null;
        const now = new Date().toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = items as any[];

        // 1. ยา — ตัดสต๊อกกลับ
        const drugRefs = rows.filter(i => i.item_type === "drug" && i.item_ref_id);
        if (drugRefs.length) {
            const { data: orders } = await supabase.from("drug_orders")
                .select("id, item_id").in("id", drugRefs.map(i => i.item_ref_id));
            const orderMap = new Map((orders || []).map((o: { id: string; item_id: string }) => [o.id, o.item_id]));
            for (const it of drugRefs) {
                const itemId = orderMap.get(it.item_ref_id) as string | undefined;
                const qty = Number(it.qty) || 0;
                if (!itemId || qty <= 0) continue;
                const { data: inv } = await supabase.from("inventory").select("stock_qty").eq("id", itemId).maybeSingle();
                if (!inv) continue;
                const bal = Number(inv.stock_qty || 0) - qty;
                await supabase.from("inventory").update({ stock_qty: bal, updated_at: now }).eq("id", itemId);
                await deductFEFO(supabase, clinicId, itemId, qty);
                await supabase.from("stock_card").insert({
                    item_id: itemId, clinic_id: clinicId, tx_type: "INVOICE",
                    qty_delta: -qty, balance_after: bal, note: `กู้คืนบิล (${invId})`,
                });
            }
        }

        // 2. service kit — ตัดสต๊อกกลับ
        const svcRefs = rows.filter(i => i.item_type === "service" && i.item_ref_id);
        if (svcRefs.length) {
            const svcIds = [...new Set(svcRefs.map(i => i.item_ref_id))];
            const { data: svcs } = await supabase.from("service_catalog")
                .select("id, inventory_item_id, consume_qty").eq("clinic_id", clinicId)
                .in("id", svcIds).not("inventory_item_id", "is", null);
            const svcMap = new Map((svcs || []).map((s: { id: string; inventory_item_id: string; consume_qty: number }) =>
                [s.id, { inv: s.inventory_item_id, qty: Number(s.consume_qty) || 1 }]));
            for (const it of svcRefs) {
                const cfg = svcMap.get(it.item_ref_id) as { inv: string; qty: number } | undefined;
                if (!cfg) continue;
                const consume = cfg.qty * Math.max(1, Number(it.qty || 1));
                const { data: inv } = await supabase.from("inventory").select("stock_qty").eq("id", cfg.inv).maybeSingle();
                if (!inv) continue;
                const bal = Number(inv.stock_qty || 0) - consume;
                await supabase.from("inventory").update({ stock_qty: bal, updated_at: now }).eq("id", cfg.inv);
                await deductFEFO(supabase, clinicId, cfg.inv, consume);
                await supabase.from("stock_card").insert({
                    item_id: cfg.inv, clinic_id: clinicId, tx_type: "INVOICE",
                    qty_delta: -consume, balance_after: bal, note: `กู้คืนบิล-บริการ (${invId})`,
                });
            }
        }

        // 3. ของฉีด (vial) — void ลบ vial_usage ไปแล้ว กู้อัตโนมัติไม่ได้ → เตือนให้เช็คเอง
        if (vn && rows.some(i => i.item_type === "injectable")) {
            warn = "บิลนี้มีรายการฉีด (vial) — สต๊อก vial ถูกคืนตอน void และกู้อัตโนมัติไม่ได้ กรุณาตรวจ/ปรับสต๊อก vial เอง";
        }

        revalidatePath("/dashboard/inventory");
    } catch (e) {
        warn = (warn ? warn + " · " : "") + "ตัดสต๊อกกลับบางส่วนไม่สำเร็จ กรุณาตรวจสต๊อก";
        console.warn("[unvoid] deduct stock failed:", e);
    }
    return warn;
}

/** กู้คืนใบเสร็จที่ยกเลิก (unvoid) — owner/admin · ตัดสต๊อกกลับ · เคารพล็อกปิดยอด · audit */
export async function unvoidInvoice(invId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        const role = (prof?.role as string) || "";
        if (role !== "owner" && role !== "admin") return { success: false, error: "กู้คืนใบเสร็จได้เฉพาะเจ้าของ/ผู้จัดการ (owner/admin)" };

        const { data: inv } = await supabase.from("invoice_headers")
            .select("id, clinic_id, vn, invoice_date, total_amount, paid_amount, status").eq("id", invId).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (inv.status !== "voided") return { success: false, error: "ใบนี้ไม่ได้อยู่สถานะยกเลิก จึงไม่ต้องกู้คืน" };
        if (await isDayClosed(supabase, inv.clinic_id, inv.invoice_date)) return { success: false, error: DAY_LOCKED_MSG };

        // ตัดสต๊อกกลับ (mirror void) ก่อนคืนสถานะ
        const warn = await deductInvoiceStock(supabase, invId, inv.clinic_id, inv.vn as string | null);

        const total = Number(inv.total_amount || 0);
        const paid = Number(inv.paid_amount || 0);
        const status = total > 0 && paid >= total ? "paid" : paid > 0 ? "partial" : "issued";
        const { error: upErr } = await supabase.from("invoice_headers")
            .update({ status, updated_at: new Date().toISOString() }).eq("id", invId);
        if (upErr) return { success: false, error: upErr.message };

        try {
            await supabase.from("audit_logs").insert({
                clinic_id: inv.clinic_id, table_name: "invoice_headers", record_id: invId,
                action: "unvoid",
                old_data: { status: "voided" },
                new_data: { status, reason: "กู้คืนใบเสร็จ (ยกเลิกการ void)" + (warn ? ` · ${warn}` : "") },
                performed_by: user.id,
            });
        } catch { /* audit best-effort */ }

        revalidatePath("/dashboard/finance");
        revalidatePath(`/dashboard/finance/${invId}`);
        return { success: true, warn };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ย้ายวันลงบัญชีของบิล (invoice_date + bill_date + paid_at) — owner/admin · ผ่าน RPC atomic (mig 138) */
export async function changeInvoiceDate(invId: string, newDate: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { success: false, error: "รูปแบบวันที่ไม่ถูกต้อง" };
        const { data, error } = await supabase.rpc("fn_move_invoice_date", { p_inv_id: invId, p_new_date: newDate });
        if (error) return { success: false, error: error.message };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = data as any;
        if (!r?.ok) return { success: false, error: r?.error || "ย้ายวันไม่สำเร็จ" };
        revalidatePath("/dashboard/finance");
        revalidatePath(`/dashboard/finance/${invId}`);
        revalidatePath("/dashboard/eod");
        revalidatePath("/dashboard/overview");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ดึงประวัติการกระทำต่อใบเสร็จ (void/refund) — สำหรับแสดงในหน้า detail */
export async function getInvoiceAuditLogs(invId: string) {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("audit_logs")
            .select(`
                id, action, old_data, new_data, performed_at, performed_by,
                profiles!audit_logs_performed_by_fkey(full_name, role)
            `)
            .eq("table_name", "invoice_headers")
            .eq("record_id", invId)
            .order("performed_at", { ascending: false });
        if (error) return { success: false, error: error.message, data: [] };
        return { success: true, data: data || [] };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", data: [] };
    }
}
