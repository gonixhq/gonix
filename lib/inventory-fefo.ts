/**
 * FEFO stock deduction — ตัดจากล็อตที่หมดอายุก่อน (First-Expired-First-Out)
 * เรียกควบคู่กับการลด inventory.stock_qty ที่จุดจ่ายยา/ใช้ของ
 * (inventory.stock_qty = ยอดรวม, inventory_lots = แยกตามล็อต)
 */

/** ตัดสต๊อก qty จากล็อต FEFO (ล็อต expiry เก่าสุดก่อน) แล้ว sync วันหมดอายุรายการ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deductFEFO(supabase: any, clinicId: string, itemId: string, qty: number) {
    if (!itemId || !(qty > 0)) return;
    let remaining = qty;
    const { data: lots } = await supabase
        .from("inventory_lots")
        .select("id, qty_remaining")
        .eq("clinic_id", clinicId).eq("item_id", itemId).gt("qty_remaining", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .order("received_at", { ascending: true });
    for (const lot of lots || []) {
        if (remaining <= 0) break;
        const take = Math.min(Number(lot.qty_remaining || 0), remaining);
        if (take <= 0) continue;
        await supabase.from("inventory_lots").update({ qty_remaining: Number(lot.qty_remaining) - take }).eq("id", lot.id);
        remaining -= take;
    }
    try { await supabase.rpc("fn_sync_item_expiry", { p_item_id: itemId }); } catch { /* ignore */ }
}

/** คืนสต๊อก qty เข้าล็อต (กรณียกเลิก/คืนของ) — เติมเข้าล็อตใกล้หมดก่อน, ไม่มีล็อต→สร้างล็อตคืน */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function restoreFEFO(supabase: any, clinicId: string, itemId: string, qty: number) {
    if (!itemId || !(qty > 0)) return;
    const { data: lots } = await supabase
        .from("inventory_lots")
        .select("id, qty_remaining")
        .eq("clinic_id", clinicId).eq("item_id", itemId)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .order("received_at", { ascending: true });
    if (lots && lots.length > 0) {
        await supabase.from("inventory_lots").update({ qty_remaining: Number(lots[0].qty_remaining || 0) + qty }).eq("id", lots[0].id);
    } else {
        await supabase.from("inventory_lots").insert({
            clinic_id: clinicId, item_id: itemId, lot_no: null, expiry_date: null,
            qty_received: qty, qty_remaining: qty, note: "คืนสต๊อก",
        });
    }
    try { await supabase.rpc("fn_sync_item_expiry", { p_item_id: itemId }); } catch { /* ignore */ }
}
