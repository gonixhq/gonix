"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import { deductFEFO } from "@/lib/inventory-fefo";

export interface InvoiceItemInput {
    item_type: string;
    item_ref_id?: string;
    item_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
    segment?: string | null;   // แผนกรายได้ (denormalize จาก source)
}

export interface CheckoutInput {
    vn: string;
    items: InvoiceItemInput[];
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    paymentMethod: string;
    paymentRef?: string;   // อ้างอิง เช่น เลขท้ายสลิป 4 ตัว (โอน/บัตร)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drugOrders: any[];
}

export async function completeCheckout(input: CheckoutInput) {
    const supabase = await createClient();

    try {
        const { vn, items, subtotal, discount, total, paid, paymentMethod, paymentRef, drugOrders } = input;

        // Fetch visit (clinic_id, hn)
        const { data: visit, error: vErr } = await supabase
            .from("visits")
            .select("clinic_id, hn")
            .eq("vn", vn)
            .single();

        if (vErr || !visit) throw new Error("Visit not found");

        const clinicId = visit.clinic_id;
        const hn = visit.hn;

        // 1. Mark visit as completed
        const { error: visitError } = await supabase
            .from("visits")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("vn", vn);

        if (visitError) throw visitError;

        // 2. Update queue_entries → done
        await supabase.from("queue_entries")
            .update({ status: "done", done_at: new Date().toISOString() })
            .eq("vn", vn);

        // 3. Deduct inventory for billed drugs (เคาท์เตอร์อาจลบยา/แก้ qty)
        const billedDrugRefIds = new Set(
            items.filter(i => i.item_type === "drug" && i.item_ref_id).map(i => i.item_ref_id!)
        );
        if (drugOrders.length > 0) {
            const itemIds = drugOrders
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((d: any) => billedDrugRefIds.has(d.id))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((d: any) => d.item_id)
                .filter(Boolean);
            if (itemIds.length > 0) {
                const { data: currentStock } = await supabase
                    .from("inventory")
                    .select("id, stock_qty")
                    .in("id", itemIds);

                if (currentStock) {
                    for (const drug of drugOrders) {
                        if (!billedDrugRefIds.has(drug.id)) continue;
                        const inv = currentStock.find(i => i.id === drug.item_id);
                        if (inv) {
                            // ใช้ qty จาก line item (เคาท์เตอร์อาจแก้ qty ก่อนจ่าย)
                            const billedLine = items.find(it => it.item_ref_id === drug.id);
                            const billedQty = billedLine ? billedLine.qty : (drug.qty || 0);
                            const newStock = Math.max(0, (inv.stock_qty || 0) - billedQty);
                            await supabase
                                .from("inventory")
                                .update({ stock_qty: newStock })
                                .eq("id", drug.item_id);
                            // ตัดล็อตแบบ FEFO (ล็อตหมดอายุก่อน=ตัดก่อน)
                            await deductFEFO(supabase, clinicId, drug.item_id, billedQty);
                        }
                    }
                }
            }
        }

        // 4. Create Invoice Header (ใช้ Asia/Bangkok date)
        const invId = `INV-${new Date().getTime().toString().slice(-6)}-${vn.slice(-4)}`;
        // Status ตามยอดที่ชำระ: ครบ=paid, บางส่วน=partial, ไม่ได้รับ=issued
        const invoiceStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "issued";
        const { error: invErr } = await supabase
            .from("invoice_headers")
            .insert({
                id: invId,
                clinic_id: clinicId,
                vn,
                hn,
                invoice_date: bangkokDate(),
                subtotal,
                discount_amount: discount,
                total_amount: total,
                paid_amount: paid,
                status: invoiceStatus,
            });

        if (invErr) {
            console.error("Invoice header error:", invErr);
            throw new Error(`สร้างใบแจ้งหนี้ไม่สำเร็จ: ${invErr.message}`);
        }

        // 5. Create invoice_items
        if (items.length > 0) {
            const rows = items.map(it => ({
                inv_id: invId,
                clinic_id: clinicId,
                item_type: it.item_type,
                item_ref_id: it.item_ref_id || null,
                item_name: it.item_name,
                qty: it.qty,
                unit_price: it.unit_price,
                line_total: it.line_total,
                segment: it.segment || null,
            }));
            const { error: itemsErr } = await supabase.from("invoice_items").insert(rows);
            if (itemsErr) {
                console.error("Invoice items error:", itemsErr);
                // non-blocking
            }
        }

        // 5b. Soft approval gate — ถ้ามีส่วนลด → สร้างคำขออนุมัติ (ไม่บล็อกการชำระ)
        if (discount > 0) {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const [profRes, patRes] = await Promise.all([
                    user ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
                    supabase.from("patients").select("first_name, last_name, phone").eq("hn", hn).maybeSingle(),
                ]);
                const requesterName = (profRes.data?.full_name as string) || "";
                const patientName = patRes.data ? `${patRes.data.first_name || ""} ${patRes.data.last_name || ""}`.trim() : "";
                // self-transaction: ชื่อลูกค้าตรงกับพนักงานที่เปิดบิล
                const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
                const isSelf = !!requesterName && !!patientName && norm(requesterName) === norm(patientName);

                // เพดานส่วนลด (max_discount ต่อคอส) — คำนวณฝั่ง server ให้เชื่อถือได้
                // คอสที่ตั้งเพดานไว้ → ให้ลดได้ไม่เกิน line_total × pct% · รายการอื่น (ยา/บริการ) ไม่จำกัด
                const pkgIds = [...new Set(items.filter(i => i.item_type === "package" && i.item_ref_id).map(i => i.item_ref_id as string))];
                const capMap: Record<string, number | null> = {};
                if (pkgIds.length > 0) {
                    const { data: caps } = await supabase.from("service_packages").select("id, max_discount_pct").in("id", pkgIds);
                    for (const c of caps || []) capMap[c.id as string] = c.max_discount_pct == null ? null : Number(c.max_discount_pct);
                }
                let ceiling = 0;
                for (const it of items) {
                    const lineTotal = Number(it.line_total ?? it.qty * it.unit_price);
                    const cap = it.item_type === "package" && it.item_ref_id ? capMap[it.item_ref_id] : null;
                    ceiling += cap == null ? lineTotal : lineTotal * (cap / 100);
                }
                const overLimit = pkgIds.length > 0 && discount > ceiling + 0.01;

                await supabase.from("price_approvals").insert({
                    clinic_id: clinicId, inv_id: invId, vn, hn, patient_name: patientName,
                    requested_by: user?.id || null, requester_name: requesterName,
                    discount_amount: discount, subtotal, total,
                    is_self_transaction: isSelf, status: "pending",
                    discount_ceiling: Math.round(ceiling * 100) / 100, over_discount_limit: overLimit,
                });
            } catch (e) {
                console.warn("[checkout] price approval log failed:", e);
            }
        }

        // 6. Create payment log (เฉพาะถ้ามีการชำระจริง)
        if (paid > 0) {
            const dbPaymentMethod = paymentMethod === "credit" ? "credit_card" : paymentMethod;
            const { error: payErr } = await supabase
                .from("payment_logs")
                .insert({
                    inv_id: invId,
                    clinic_id: clinicId,
                    payment_method: dbPaymentMethod,
                    amount: paid,
                    transaction_ref: paymentRef?.trim() || null,
                    note: paid < total ? `มัดจำ — ค้าง ฿${(total - paid).toLocaleString()}` : null,
                });

            if (payErr) {
                console.error("Payment log error:", payErr);
            }
        }

        // 7. Create patient_packages for package items
        const packageItems = items.filter(i => i.item_type === "package" && i.item_ref_id);
        if (packageItems.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: staffRow } = user
                ? await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle()
                : { data: null };

            for (const item of packageItems) {
                const { data: pkg } = await supabase
                    .from("service_packages")
                    .select("name, total_sessions, validity_days")
                    .eq("id", item.item_ref_id!)
                    .maybeSingle();
                if (!pkg) continue;

                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + (pkg.validity_days || 365));

                // qty = จำนวนคอสที่ซื้อ (default 1)
                const numToCreate = Math.max(1, Math.floor(item.qty));
                for (let i = 0; i < numToCreate; i++) {
                    await supabase.from("patient_packages").insert({
                        clinic_id: clinicId,
                        hn,
                        package_id: item.item_ref_id!,
                        invoice_id: invId,
                        package_name: pkg.name,
                        total_sessions: pkg.total_sessions,
                        paid_amount: item.unit_price,
                        expires_at: expiresAt.toISOString(),
                        created_by: staffRow?.id || null,
                    });
                }
            }
            revalidatePath(`/dashboard/patients/${hn}`);
        }

        revalidatePath("/dashboard/pharmacy");
        revalidatePath("/dashboard/finance");
        revalidatePath("/dashboard");
        return { success: true, invId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Checkout error:", error.message);
        return { error: error.message || "Failed to complete checkout" };
    }
}
