"use server";

import { createClient } from "@/lib/supabase/server";

/** ผูกบัญชี LINE กับผู้ป่วย — เรียกจากหน้า LIFF (verify ด้วย HN + เบอร์ 4 ตัวท้าย) */
export async function linkLineAccount(
    clinicId: string, lineUid: string, display: string, hn: string, phone4: string
): Promise<{ ok: boolean; name?: string; error?: string }> {
    if (!clinicId || !lineUid) return { ok: false, error: "ข้อมูลไม่ครบ (เปิดผ่าน LINE เท่านั้น)" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("link_line_account", {
        p_clinic: clinicId,
        p_line_uid: lineUid,
        p_display: display || null,
        p_hn: (hn || "").trim(),
        p_phone4: (phone4 || "").replace(/\D/g, "").slice(-4),
    });
    if (error) return { ok: false, error: "ระบบขัดข้อง กรุณาลองใหม่" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    if (!r?.ok) {
        const msg = r?.error === "not_found" ? "ไม่พบ HN นี้ในระบบ"
            : r?.error === "verify_failed" ? "HN หรือเบอร์ 4 ตัวท้าย ไม่ถูกต้อง"
                : "ผูกบัญชีไม่สำเร็จ";
        return { ok: false, error: msg };
    }
    return { ok: true, name: r.name };
}
