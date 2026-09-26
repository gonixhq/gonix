"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import { deductFEFO } from "@/lib/inventory-fefo";
import { deductVials } from "@/lib/inventory-vials";
import { validatePayments, type PaymentEntry } from "@/lib/checkout-payment";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import type { DiscountEntry } from "@/lib/campaign-types";

export interface InvoiceItemInput {
    item_type: string;
    item_ref_id?: string;
    item_name: string;
    qty: number;
    unit_price: number;
    line_total: number;        // ราคาเต็มของรายการ (ก่อนหักส่วนลด) — ฐานค่ามือ
    discount_amount?: number;  // ส่วนลดเฉพาะรายการนี้ (เก็บแยก ไม่หักออกจาก line_total)
    segment?: string | null;   // แผนกรายได้ (denormalize จาก source)
    performer_staff_id?: string | null;  // แพทย์ผู้ทำรายการ → DF แพทย์ % (เฟส 2B, snapshot อัตราที่ DB)
    hand_main_staff_id?: string | null;  // ผู้ปฏิบัติหลัก → ค่ามือเต็ม (เฟส 2C, คำนวณ+snapshot ที่ DB)
    hand_asst_staff_id?: string | null;  // ผู้ช่วย → ค่ามือผู้ช่วย
    team_offsite?: boolean;              // ผ่าตัดที่สถานพยาบาลอื่น → คอมทีม 40% (mig 153)
    course_sessions?: number | null;     // >1 = ขายเมนูบริการเป็นคอร์ส N ครั้ง (mig 153)
}

export interface CheckoutInput {
    vn: string;
    items: InvoiceItemInput[];
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    payments: PaymentEntry[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drugOrders: any[];
    discounts?: DiscountEntry[];      // breakdown ส่วนลดทุกก้อน
    campaignId?: string | null;
    campaignLabel?: string | null;
    billType?: "normal" | "review" | "free_fix";  // เคสรีวิว = ค่ามือเต็ม (ต้นทุนการตลาด) · แก้ไขฟรี = ค่ามือครึ่ง
    billDate?: string;                // วันที่พิมพ์บนใบเสร็จ (YYYY-MM-DD) — ย้อนหลังได้เฉพาะ owner/admin
}

export async function completeCheckout(input: CheckoutInput) {
    const supabase = await createClient();

    try {
        const { vn, items, subtotal, discount, total, paid, payments, drugOrders,
            discounts, campaignId, campaignLabel, billType } = input;

        const actor = await getEffectivePermissionsForUser();
        if (!actor.userId || !actor.clinicId || !actor.isActive || !actor.isApproved || !actor.permissions["finance.collect"]) throw Error("ไม่มีสิทธิ์รับชำระเงิน");
        validatePayments(total, paid, payments);

        // Fetch visit (clinic_id, hn)
        const { data: visit, error: vErr } = await supabase
            .from("visits")
            .select("clinic_id, hn")
            .eq("vn", vn)
            .eq("clinic_id", actor.clinicId)
            .single();

        if (vErr || !visit) throw new Error("Visit not found");

        const clinicId = visit.clinic_id;
        const hn = visit.hn;

        // 0-guard. กันบิลซ้ำ: visit นี้ต้องยังไม่มีใบเสร็จที่ยังใช้งานอยู่
        //   (กันกดปิดบิลซ้ำ/สองแท็บ/retry → 1 visit = 1 บิลเสมอ · ยกเว้นที่ยกเลิก/คืนเงินไปแล้ว)
        const { data: dupInv } = await supabase
            .from("invoice_headers")
            .select("id")
            .eq("vn", vn)
            .not("status", "in", "(voided,refunded)")
            .limit(1);
        if (dupInv && dupInv.length > 0) {
            return { error: `Visit นี้ออกใบเสร็จไปแล้ว (${dupInv[0].id}) — ถ้าต้องการออกใบใหม่ ให้ยกเลิก (void) ใบเดิมก่อน` };
        }

        // 0. Pre-check: สต๊อก vial ต้องพอ "ก่อน" เขียนอะไรทั้งสิ้น (block ปิดบิล — บังคับคีย์รับเข้าก่อน)
        const injBill = new Map<string, number>();
        for (const it of items) {
            if (it.item_type === "injectable" && it.item_ref_id) {
                injBill.set(it.item_ref_id, (injBill.get(it.item_ref_id) || 0) + Number(it.qty));
            }
        }
        if (injBill.size > 0) {
            const { data: injItems } = await supabase.from("inventory")
                .select("id, item_name, stock_qty").in("id", [...injBill.keys()]);
            const shorts: string[] = [];
            for (const inv of injItems || []) {
                const need = injBill.get(inv.id as string) || 0;
                const have = Number(inv.stock_qty || 0);
                if (need > have + 0.001) shorts.push(`• ${inv.item_name}: มี ${have.toLocaleString()} / ต้องใช้ ${need.toLocaleString()}`);
            }
            if (shorts.length > 0) {
                return { error: `สต๊อก vial ไม่พอ — กรุณารับเข้าสต๊อกให้ครบก่อนปิดบิล:\n${shorts.join("\n")}` };
            }
        }

        // 0b. วันที่บนใบเสร็จ (bill_date) — validate "ก่อน" เขียนอะไร
        //     invoice_date (posting/การเงิน) = วันนี้เสมอ · bill_date = วันที่พิมพ์ (ย้อนหลังได้เฉพาะ owner/admin)
        const today = bangkokDate();                 // Asia/Bangkok (ไม่ใช่ UTC)
        let billDate = today;
        if (input.billDate && input.billDate !== today) {
            if (input.billDate > today) {
                return { error: "วันที่บนใบเสร็จต้องไม่เกินวันนี้ (ห้ามลงวันที่อนาคต)" };
            }
            // ย้อนหลัง → default-deny: อนุญาตเฉพาะ owner/admin เท่านั้น (role อื่นห้ามทั้งหมด)
            const { data: { user: bdUser } } = await supabase.auth.getUser();
            const { data: prof } = bdUser
                ? await supabase.from("profiles").select("role").eq("id", bdUser.id).maybeSingle()
                : { data: null };
            const role = (prof?.role as string) || "";
            if (role !== "owner" && role !== "admin") {
                return { error: "ออกใบเสร็จย้อนหลังได้เฉพาะเจ้าของ/ผู้จัดการ (owner/admin) เท่านั้น" };
            }
            billDate = input.billDate;
            // audit row สร้างโดย DB trigger (trg_log_backdated_bill) ในทรานแซกชันเดียวกับ invoice
            // → atomic: บิลย้อนหลัง + audit เกิด/ล้มพร้อมกันเสมอ (ไม่ต้อง insert เองที่ app)
        }

        // 0c. Pre-check: สต๊อกยาต้องพอก่อนปิดบิล (block — กันจ่ายเกินสต๊อก)
        const drugBill = new Map<string, number>();
        for (const it of items) {
            if (it.item_type === "drug" && it.item_ref_id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ord = drugOrders.find((d: any) => d.id === it.item_ref_id);
                const itemId = ord?.item_id;
                if (itemId) drugBill.set(itemId, (drugBill.get(itemId) || 0) + Number(it.qty));
            }
        }
        if (drugBill.size > 0) {
            const { data: drugStock } = await supabase.from("inventory")
                .select("id, item_name, stock_qty").in("id", [...drugBill.keys()]);
            const shorts: string[] = [];
            for (const inv of drugStock || []) {
                const need = drugBill.get(inv.id as string) || 0;
                const have = Number(inv.stock_qty || 0);
                if (need > have + 0.001) shorts.push(`• ${inv.item_name}: มี ${have.toLocaleString()} / ต้องใช้ ${need.toLocaleString()}`);
            }
            if (shorts.length > 0) {
                return { error: `สต๊อกยาไม่พอ — กรุณารับเข้าสต๊อกให้ครบก่อนปิดบิล:\n${shorts.join("\n")}` };
            }
        }

        // หัวบิล + รายการ + รับเงินทุกช่องทางสำเร็จพร้อมกัน ก่อนตัดสต๊อก
        const invId = `INV-${new Date().getTime().toString().slice(-6)}-${vn.slice(-4)}`;
        const { data: invoice, error: invoiceError } = await supabase.rpc("create_checkout_invoice", {
            p_invoice: { id: invId, vn, subtotal: Number(subtotal.toFixed(2)), discount: Number(discount.toFixed(2)), total,
                bill_date: billDate, campaign_id: campaignId || null, campaign: campaignLabel || null, bill_type: billType || "normal" },
            p_items: items.map(it => ({ ...it, line_total: Number(it.line_total.toFixed(2)), discount_amount: Number((it.discount_amount || 0).toFixed(2)) })),
            p_payments: payments,
        });
        if (invoiceError) throw Error(`บันทึกใบเสร็จและรับเงินไม่สำเร็จ: ${invoiceError.message}`);
        const itemIds: string[] = invoice?.item_ids || [];

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

        // 5a. Breakdown ส่วนลด → invoice_discounts (ใช้ทำรายงาน/audit ส่วนลด)
        if (discounts && discounts.length > 0) {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const discRows = discounts
                    .filter(d => Number(d.amount) > 0)
                    .map(d => ({
                        clinic_id: clinicId,
                        inv_id: invId,
                        inv_item_id: d.inv_item_index != null ? (itemIds[d.inv_item_index] || null) : null,
                        discount_type: d.discount_type,
                        discount_source: d.discount_source || null,
                        campaign_id: d.campaign_id || null,
                        amount: Number(d.amount),
                        created_by: user?.id || null,
                    }));
                if (discRows.length > 0) {
                    const { error: dErr } = await supabase.from("invoice_discounts").insert(discRows);
                    if (dErr) console.warn("[checkout] invoice_discounts:", dErr.message);
                }
            } catch (e) {
                console.warn("[checkout] discount breakdown failed:", e);
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

        // 5c. เวชภัณฑ์ฉีด (vial model B, P06) — ตัด vial ตามบิล + บันทึก recall + เทียบกับที่หมอบันทึก
        //     (item_type='injectable' → ข้าม drug/service-kit bulk path ด้านบน/ล่าง ไม่ตัดซ้ำ)
        try {
            const injLines = items.filter(i => i.item_type === "injectable" && i.item_ref_id);
            if (injLines.length > 0) {
                const { data: { user } } = await supabase.auth.getUser();
                const billByItem = new Map<string, number>();
                for (const it of injLines) billByItem.set(it.item_ref_id!, (billByItem.get(it.item_ref_id!) || 0) + Number(it.qty));

                for (const [itemId, billQty] of billByItem) {
                    const res = await deductVials(supabase, clinicId, itemId, billQty);
                    if (!res.ok) { console.warn("[checkout] deductVials:", res.error); continue; }
                    const rows = (res.used || []).map(u => ({
                        clinic_id: clinicId, vn, hn, item_id: itemId,
                        vial_id: u.vial_id, lot_number: u.lot, qty: u.qty,
                    }));
                    if (rows.length) await supabase.from("vial_usage").insert(rows);
                }

                // reconcile: หมอบันทึก vs บิล → flag ถ้าต่าง (leakage/คิดเงินขาด)
                const { data: docInj } = await supabase.from("visit_injections").select("item_id, qty").eq("vn", vn);
                const docByItem = new Map<string, number>();
                for (const d of docInj || []) docByItem.set(d.item_id as string, (docByItem.get(d.item_id as string) || 0) + Number(d.qty));
                const mismatches: { item_id: string; doctor: number; billed: number }[] = [];
                for (const itemId of new Set([...billByItem.keys(), ...docByItem.keys()])) {
                    const b = billByItem.get(itemId) || 0, dq = docByItem.get(itemId) || 0;
                    if (Math.abs(b - dq) > 0.001) mismatches.push({ item_id: itemId, doctor: dq, billed: b });
                }
                if (mismatches.length > 0) {
                    await supabase.from("audit_logs").insert({
                        clinic_id: clinicId, table_name: "visits", record_id: vn, action: "injection_mismatch",
                        new_data: { inv_id: invId, mismatches }, performed_by: user?.id || null,
                    });
                }
                revalidatePath("/dashboard/inventory");
            }
        } catch (e) {
            console.warn("[checkout] injectable vial deduction failed:", e);
        }

        // 7a. คอร์สจากเมนูบริการ (N ครั้ง) → คอร์สค้างใช้ผูก service_id (mig 153)
        const courseLines = items.filter(i => (i.course_sessions || 0) > 1 && i.item_ref_id);
        if (courseLines.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: staffRow } = user ? await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle() : { data: null };
            const sumAfterC = items.reduce((s, i) => s + (Number(i.line_total) || 0) - (Number(i.discount_amount) || 0), 0);
            for (const item of courseLines) {
                const lineAfter = (Number(item.line_total) || 0) - (Number(item.discount_amount) || 0);
                const netPrice = sumAfterC > 0 ? Math.round(lineAfter * total / sumAfterC * 100) / 100 : Number(item.line_total) || 0;
                const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 365);
                const { error: cErr } = await supabase.from("patient_packages").insert({
                    clinic_id: clinicId, hn, package_id: null, service_id: item.item_ref_id, invoice_id: invId,
                    package_name: `${item.item_name} (คอร์ส ${item.course_sessions} ครั้ง)`, total_sessions: Math.floor(item.course_sessions!),
                    paid_amount: Number(item.line_total) || 0, net_price: netPrice, expires_at: expiresAt.toISOString(), created_by: staffRow?.id || null,
                });
                if (cErr) console.warn("[checkout] create service course failed:", cErr.message);
            }
            revalidatePath(`/dashboard/patients/${hn}`);
        }

        // 7. Create patient_packages for package items
        const packageItems = items.filter(i => i.item_type === "package" && i.item_ref_id);
        if (packageItems.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: staffRow } = user
                ? await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle()
                : { data: null };

            // ราคาขายจริงหลังส่วนลด (ส่วนลดรายการ + ส่วนลดท้ายบิลเกลี่ยตามสัดส่วน) → มูลค่าคงเหลือคอส (เฟส 3)
            const sumAfter = items.reduce((s, i) => s + (Number(i.line_total) || 0) - (Number(i.discount_amount) || 0), 0);
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
                const lineAfter = (Number(item.line_total) || 0) - (Number(item.discount_amount) || 0);
                const netPrice = sumAfter > 0 ? Math.round(lineAfter * total / sumAfter / numToCreate * 100) / 100 : item.unit_price;
                for (let i = 0; i < numToCreate; i++) {
                    await supabase.from("patient_packages").insert({
                        clinic_id: clinicId,
                        hn,
                        package_id: item.item_ref_id!,
                        invoice_id: invId,
                        package_name: pkg.name,
                        total_sessions: pkg.total_sessions,
                        paid_amount: item.unit_price,
                        net_price: netPrice,
                        expires_at: expiresAt.toISOString(),
                        created_by: staffRow?.id || null,
                    });
                }
            }
            revalidatePath(`/dashboard/patients/${hn}`);
        }

        // 8. ตัด stock kit ของบริการเดี่ยว (service_catalog.inventory_item_id + consume_qty, mig 052)
        //    เช่น HIFU ขายครั้งเดียว → ตัด shot ตามที่ตั้งไว้ (best-effort, ไม่ block การชำระ)
        try {
            const serviceItems = items.filter(i => i.item_type === "service" && i.item_ref_id && !((i.course_sessions || 0) > 1));  // คอร์ส: ตัดสต๊อกตอนใช้
            const svcIds = [...new Set(serviceItems.map(i => i.item_ref_id!))];
            if (svcIds.length > 0) {
                const { data: svcs } = await supabase.from("service_catalog")
                    .select("id, inventory_item_id, consume_qty")
                    .eq("clinic_id", clinicId).in("id", svcIds).not("inventory_item_id", "is", null);  // kit เดิม (1 รายการ)
                const svcMap = new Map((svcs || []).map(s => [s.id as string, { inv: s.inventory_item_id as string, qty: Number(s.consume_qty) || 1 }]));
                const { data: { user } } = await supabase.auth.getUser();
                const { data: staffRow } = user ? await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle() : { data: null };
                for (const it of serviceItems) {
                    const cfg = svcMap.get(it.item_ref_id!);
                    if (!cfg) continue;
                    const deduct = cfg.qty * Math.max(1, Number(it.qty || 1));
                    const { data: invItem } = await supabase.from("inventory").select("stock_qty").eq("id", cfg.inv).eq("clinic_id", clinicId).maybeSingle();
                    if (!invItem) continue;
                    const bal = Number(invItem.stock_qty || 0) - deduct;
                    await supabase.from("inventory").update({ stock_qty: bal, updated_at: new Date().toISOString() }).eq("id", cfg.inv);
                    await deductFEFO(supabase, clinicId, cfg.inv, deduct);
                    await supabase.from("stock_card").insert({
                        item_id: cfg.inv, clinic_id: clinicId, tx_type: "INTERNAL_USE",
                        qty_delta: -deduct, balance_after: bal, note: `ใช้กับบริการ (${invId})`, recorded_by: staffRow?.id || null,
                    });
                }
                // สูตรหัตถการ (เฟส 4A, service_recipes) — ตัดทุกบรรทัดที่ cut_stock
                const { data: recipes } = await supabase.from("service_recipes")
                    .select("service_id, inventory_item_id, qty").eq("clinic_id", clinicId).eq("cut_stock", true).in("service_id", svcIds);
                for (const it of serviceItems) {
                    for (const r of (recipes || []).filter(x => x.service_id === it.item_ref_id)) {
                        const invId2 = r.inventory_item_id as string;
                        const deduct = Number(r.qty) * Math.max(1, Number(it.qty || 1));
                        const { data: invItem } = await supabase.from("inventory").select("stock_qty").eq("id", invId2).eq("clinic_id", clinicId).maybeSingle();
                        if (!invItem || deduct <= 0) continue;
                        const bal = Number(invItem.stock_qty || 0) - deduct;
                        await supabase.from("inventory").update({ stock_qty: bal, updated_at: new Date().toISOString() }).eq("id", invId2);
                        await deductFEFO(supabase, clinicId, invId2, deduct);
                        await supabase.from("stock_card").insert({
                            item_id: invId2, clinic_id: clinicId, tx_type: "INTERNAL_USE",
                            qty_delta: -deduct, balance_after: bal, note: `สูตร: ${it.item_name} (${invId})`, recorded_by: staffRow?.id || null,
                        });
                    }
                }
                if ((svcs && svcs.length > 0) || (recipes && recipes.length > 0)) revalidatePath("/dashboard/inventory");
            }
        } catch (e) {
            console.warn("[checkout] service kit deduct failed:", e);
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
