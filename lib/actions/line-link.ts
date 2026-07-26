"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/** ดึง client IP จาก proxy header (Vercel ตั้ง x-forwarded-for) — ใช้ทำ rate limit */
async function clientIp(): Promise<string> {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return h.get("x-real-ip") || "unknown";
}

/** ผูกบัญชี LINE กับผู้ป่วย — เรียกจากหน้า LIFF (verify ด้วย HN + เบอร์ 4 ตัวท้าย)
 *  security: error รวมเป็น verify_failed อันเดียว (กัน enumerate HN) + rate limit ต่อ IP (mig 109) */
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
        p_ip: await clientIp(),
    });
    if (error) return { ok: false, error: "ระบบขัดข้อง กรุณาลองใหม่" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    if (!r?.ok) {
        const msg = r?.error === "rate_limited"
            ? "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่"
            : "HN หรือเบอร์ 4 ตัวท้าย ไม่ถูกต้อง";   // uniform — ไม่บอกว่า HN ไม่มี หรือเบอร์ผิด
        return { ok: false, error: msg };
    }
    return { ok: true, name: r.name };
}
