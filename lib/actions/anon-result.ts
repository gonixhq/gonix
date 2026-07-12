"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export interface AnonResultTest {
    test_name: string;
    item_type: string;
    result_status: string;
    result_value: string | null;
}
export interface AnonResult {
    code: string;
    status: string;
    case_date: string;
    result_appt_date: string | null;
    paid: boolean;
    followup_requested: boolean;
    clinic_name: string | null;
    clinic_phone: string | null;
    tests: AnonResultTest[];
}

// ข้อความเดียวสำหรับทุกกรณีที่ verify ไม่ผ่าน — กันเดาว่ารหัสมีตัวตนจริงไหม (enumeration)
const ERR_MSG: Record<string, string> = {
    verify_failed: "รหัสยืนยัน หรือเบอร์ 4 ตัวท้าย ไม่ถูกต้อง",
    rate_limited: "พยายามเกินจำนวนครั้ง กรุณารอสักครู่แล้วลองใหม่",
};

/** ดึง client IP จาก proxy header (Vercel ตั้ง x-forwarded-for ให้) — ใช้ทำ rate limit */
async function clientIp(): Promise<string> {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return h.get("x-real-ip") || "unknown";
}

/** เช็คผลออนไลน์ — verify ด้วย Verify Code + เบอร์ 4 ตัวท้าย (RPC security-definer + rate limit ต่อ IP) */
export async function lookupAnonResult(
    code: string, phone4: string
): Promise<{ ok: true; data: AnonResult } | { ok: false; error: string }> {
    const c = (code || "").trim().toUpperCase();
    const p = (phone4 || "").replace(/\D/g, "").slice(-4);
    if (c.length < 4 || p.length !== 4) return { ok: false, error: "กรุณากรอกรหัสยืนยัน และเบอร์ 4 ตัวท้ายให้ครบ" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_anon_result", { p_code: c, p_phone4: p, p_ip: await clientIp() });
    if (error) return { ok: false, error: "ระบบขัดข้อง กรุณาลองใหม่" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    if (!r?.ok) return { ok: false, error: ERR_MSG[r?.error] || ERR_MSG.verify_failed };
    return { ok: true, data: r as AnonResult };
}

/** ขอนัดหมายพบแพทย์ */
export async function requestAnonFollowup(
    code: string, phone4: string
): Promise<{ ok: boolean; error?: string }> {
    const c = (code || "").trim().toUpperCase();
    const p = (phone4 || "").replace(/\D/g, "").slice(-4);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("request_anon_followup", { p_code: c, p_phone4: p, p_ip: await clientIp() });
    if (error) return { ok: false, error: "ระบบขัดข้อง" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return r?.ok ? { ok: true } : { ok: false, error: ERR_MSG[r?.error] || ERR_MSG.verify_failed };
}
