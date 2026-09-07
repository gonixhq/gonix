import type { createClient } from "@/lib/supabase/server";

/**
 * Vial model B — ตัดสต๊อกเวชภัณฑ์ฉีดราย-ขวด (open-then-share + FEFO)
 * เรียกตอนคิดเงิน (checkout) สำหรับ item ที่ deduction_type='injectable_vial'
 * ตรรกะ atomic + row lock อยู่ใน RPC fn_deduct_vials (mig 117)
 */

/** ตัด qty หน่วยจาก vial ของ item (ผ่าน RPC atomic) — คืนรายการ vial ที่ตัด (ไว้ trace/recall) */
export async function deductVials(
    supabase: Awaited<ReturnType<typeof createClient>>, clinicId: string, itemId: string, qty: number
): Promise<{ ok: boolean; used?: { vial_id: string; lot: string | null; qty: number }[]; error?: string }> {
    if (!itemId || !(qty > 0)) return { ok: true, used: [] };
    const { data, error } = await supabase.rpc("fn_deduct_vials", {
        p_clinic: clinicId, p_item: itemId, p_qty: qty,
    });
    if (error) {
        const msg = String(error.message || "");
        if (msg.includes("INSUFFICIENT_VIAL_STOCK")) return { ok: false, error: "สต๊อก vial ไม่พอ (เปิดขวด/รับเข้าก่อน)" };
        return { ok: false, error: msg || "ตัด vial ไม่สำเร็จ" };
    }
    const r = data as { ok?: boolean; used?: { vial_id: string; lot: string | null; qty: number }[] } | null;
    return { ok: !!r?.ok, used: r?.used || [] };
}
