"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
            .from("invoice_headers").select("status, vn, clinic_id").eq("id", invId).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (inv.status === "voided") return { success: false, error: "ใบเสร็จนี้ยกเลิกแล้ว" };
        if (inv.status === "refunded") return { success: false, error: "ใบเสร็จนี้คืนเงินไปแล้ว" };

        // Update status
        const { error } = await supabase
            .from("invoice_headers")
            .update({
                status: "voided",
                updated_at: new Date().toISOString(),
            })
            .eq("id", invId);

        if (error) return { success: false, error: error.message };

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
            .select("status, total_amount, paid_amount, clinic_id")
            .eq("id", invId).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (inv.status !== "paid") return { success: false, error: "ใบเสร็จยังไม่ได้ชำระเงิน — ใช้ยกเลิกแทน" };

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
            .select("id, clinic_id, total_amount, paid_amount, status")
            .eq("id", input.invId).single();
        if (!inv) return { success: false, error: "ไม่พบใบเสร็จ" };
        if (["voided", "refunded"].includes(inv.status)) {
            return { success: false, error: "ใบเสร็จนี้ปิดแล้ว ไม่สามารถรับชำระเพิ่ม" };
        }

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

        revalidatePath("/dashboard/finance");
        revalidatePath(`/dashboard/finance/${input.invId}`);
        return { success: true, newPaid, balance, newStatus };
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
