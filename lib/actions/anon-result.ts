"use server";

import { createClient } from "@/lib/supabase/server";

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

const ERR_MSG: Record<string, string> = {
    not_found: "ไม่พบรหัสนี้ — ตรวจสอบรหัสยืนยันอีกครั้ง",
    no_phone: "เคสนี้ไม่ได้ลงเบอร์โทรไว้ — กรุณาติดต่อ/มารับผลที่คลินิก",
    verify_failed: "รหัส หรือเบอร์ 4 ตัวท้าย ไม่ถูกต้อง",
};

/** เช็คผลออนไลน์ — verify ด้วย Verify Code + เบอร์ 4 ตัวท้าย (เรียก RPC security-definer) */
export async function lookupAnonResult(
    code: string, phone4: string
): Promise<{ ok: true; data: AnonResult } | { ok: false; error: string }> {
    const c = (code || "").trim().toUpperCase();
    const p = (phone4 || "").replace(/\D/g, "").slice(-4);
    if (c.length < 4 || p.length !== 4) return { ok: false, error: "กรุณากรอกรหัสยืนยัน และเบอร์ 4 ตัวท้ายให้ครบ" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_anon_result", { p_code: c, p_phone4: p });
    if (error) return { ok: false, error: "ระบบขัดข้อง กรุณาลองใหม่" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    if (!r?.ok) return { ok: false, error: ERR_MSG[r?.error] || "ตรวจสอบไม่สำเร็จ" };
    return { ok: true, data: r as AnonResult };
}

/** ขอนัดหมายพบแพทย์ */
export async function requestAnonFollowup(
    code: string, phone4: string
): Promise<{ ok: boolean; error?: string }> {
    const c = (code || "").trim().toUpperCase();
    const p = (phone4 || "").replace(/\D/g, "").slice(-4);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("request_anon_followup", { p_code: c, p_phone4: p });
    if (error) return { ok: false, error: "ระบบขัดข้อง" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return r?.ok ? { ok: true } : { ok: false, error: ERR_MSG[r?.error] || "ไม่สำเร็จ" };
}
