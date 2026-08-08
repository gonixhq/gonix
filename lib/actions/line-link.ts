"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { verifyLineIdToken, pushLineText } from "@/lib/line";

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

// ════════════════ P19: staff ผูก LINE รับแจ้งเตือน ════════════════

/** staff (ล็อกอิน dashboard) สร้าง token ผูก LINE → คืนลิงก์ LIFF ให้เปิดในแอป LINE
 *  reuse LIFF เดิม (/line/link?mode=staff&t=...) — ไม่ต้องตั้ง LIFF ใหม่ */
export async function generateStaffLinkToken(): Promise<{ ok: boolean; url?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID_LINK || "";
    if (!liffId) return { ok: false, error: "ยังไม่ได้ตั้งค่า LIFF (NEXT_PUBLIC_LIFF_ID_LINK)" };

    const token = randomUUID();
    const expires = new Date(Date.now() + 10 * 60000).toISOString();   // 10 นาที
    // ตั้ง token บน profile ตัวเอง (RLS profiles_self อนุญาต id=auth.uid())
    const { error } = await supabase.from("profiles")
        .update({ line_link_token: token, line_link_expires: expires }).eq("id", user.id);
    if (error) return { ok: false, error: error.message };

    return { ok: true, url: `https://liff.line.me/${liffId}?mode=staff&t=${token}` };
}

/** เรียกจากหน้า LIFF (staff mode) — verify LINE ID token แล้วผูกเข้ากับ profile ตาม token */
export async function linkStaffLine(
    token: string, idToken: string, display: string
): Promise<{ ok: boolean; error?: string }> {
    if (!token || !idToken) return { ok: false, error: "ข้อมูลไม่ครบ (เปิดผ่านลิงก์ในแอป LINE)" };
    const verify = await verifyLineIdToken(idToken);
    if (!verify.ok) {
        return { ok: false, error: verify.reason === "expired" ? "เซสชันหมดอายุ เปิดลิงก์ใหม่อีกครั้ง" : "ยืนยันตัวตน LINE ไม่สำเร็จ" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("link_staff_line", {
        p_token: token, p_line_uid: verify.sub, p_display: display || null,
    });
    if (error) return { ok: false, error: "ระบบขัดข้อง กรุณาลองใหม่" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    if (!r?.ok) {
        return { ok: false, error: r?.error === "token_invalid" ? "ลิงก์หมดอายุหรือถูกใช้ไปแล้ว — สร้างลิงก์ใหม่จากหน้าตั้งค่า" : "ผูกบัญชีไม่สำเร็จ" };
    }
    return { ok: true };
}

/** ส่งข้อความทดสอบไป LINE ที่ผูกไว้ (เช็คว่าผูกสำเร็จ + push ทำงาน) */
export async function sendTestStaffLine(): Promise<{ ok: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
    const { data: prof } = await supabase.from("profiles")
        .select("line_user_id, clinic_id").eq("id", user.id).maybeSingle();
    if (!prof?.line_user_id) return { ok: false, error: "บัญชีนี้ยังไม่ได้ผูก LINE — สร้างลิงก์แล้วเปิดในแอป LINE ก่อน" };
    let clinicName = "คลินิก";
    if (prof.clinic_id) {
        const { data: c } = await supabase.from("tenants").select("clinic_name").eq("id", prof.clinic_id).maybeSingle();
        if (c?.clinic_name) clinicName = c.clinic_name as string;
    }
    const msg = `[ทดสอบแจ้งเตือน] ${clinicName}\nระบบแจ้งเตือน LINE พร้อมใช้งานแล้ว\n(ส่งจากปุ่มทดสอบในหน้าตั้งค่า)`;
    const r = await pushLineText(prof.line_user_id as string, msg);
    if (!r.ok) return { ok: false, error: r.error || "ส่งไม่สำเร็จ — เช็ค LINE Messaging API (channel access token)" };
    return { ok: true };
}
