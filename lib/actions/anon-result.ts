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
    if (!r?.ok) return { ok: false, error: ERR_MSG[r?.error] || ERR_MSG.verify_failed };

    // best-effort: แจ้ง LINE เจ้าหน้าที่ว่ามีคนขอนัดหมาย (ถ้าไม่มี SERVICE_ROLE_KEY / ยังไม่ผูก LINE → ข้ามเงียบ)
    await notifyStaffFollowup(c);
    return { ok: true };
}

/** แจ้งเตือน LINE เจ้าหน้าที่ (owner/admin/receptionist) ว่ามีผู้รับบริการขอนัดหมาย — best-effort */
async function notifyStaffFollowup(code: string) {
    try {
        const { createServiceClient } = await import("@/lib/supabase/service");
        const { pushLineText } = await import("@/lib/line");
        const svc = createServiceClient();
        const { data: cs } = await svc.from("anon_cases").select("clinic_id").eq("verify_code", code).limit(1).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clinicId = (cs as any)?.clinic_id as string | undefined;
        if (!clinicId) return;
        const { data: staff } = await svc.from("profiles")
            .select("line_user_id")
            .eq("clinic_id", clinicId)
            .in("role", ["owner", "admin", "receptionist"])
            .not("line_user_id", "is", null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids = [...new Set((staff || []).map((s: any) => s.line_user_id as string).filter(Boolean))];
        if (ids.length === 0) return;
        const msg = `🔔 คลินิกนิรนาม — มีผู้รับบริการขอนัดหมายพบแพทย์\nรหัสเคส: ${code}\nกรุณาเปิดระบบเพื่อติดต่อกลับ`;
        for (const id of ids) { try { await pushLineText(id, msg); } catch { /* best-effort */ } }
    } catch { /* best-effort — ไม่มี service key ก็ข้าม */ }
}
