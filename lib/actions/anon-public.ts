"use server";

import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";
import { genVerifyCode } from "@/lib/utils/anon-code";

// ข้อมูลแบบประเมิน (เก็บลง questionnaire jsonb) — โครงยืดหยุ่น
export interface AnonRegPayload {
    sex?: string | null;
    age?: number | null;
    email?: string | null;
    phone?: string | null;
    questionnaire: Record<string, unknown>;
}

/**
 * ลงทะเบียนนิรนามออนไลน์ (เรียกจากหน้า public /checkin/[clinicId] โดยไม่ต้องล็อกอิน)
 * - เขียนผ่าน RLS policy `anon_cases_public_insert` (anon role, เฉพาะ online+registered)
 * - สร้าง verify_code 6 หลัก อายุ 72 ชม. — กันชนด้วยการ retry
 */
export async function submitAnonRegistration(
    clinicId: string,
    payload: AnonRegPayload
): Promise<{ ok: true; verifyCode: string; expiresAt: string } | { ok: false; error: string }> {
    if (!clinicId) return { ok: false, error: "ลิงก์ไม่ถูกต้อง (ไม่พบรหัสคลินิก)" };

    const supabase = await createClient();
    const date = bangkokDate();
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    for (let attempt = 0; attempt < 6; attempt++) {
        const code = genVerifyCode();
        const { error } = await supabase.from("anon_cases").insert({
            clinic_id: clinicId,
            verify_code: code,
            code_expires_at: expiresAt,
            reg_channel: "online",
            status: "registered",
            case_date: date,
            sex: payload.sex || null,
            age: payload.age ?? null,
            contact_email: payload.email || null,
            contact_phone: payload.phone || null,
            questionnaire: payload.questionnaire,
            total_amount: 0,
        });
        if (!error) return { ok: true, verifyCode: code, expiresAt };
        // log ฝั่ง server ไว้ debug (ไม่โชว์ error ดิบให้คนไข้)
        console.error("[anon-register] insert failed:", error.code, error.message, error.details);
        // ชนรหัสซ้ำ → สุ่มใหม่; error อื่น → คืนเลย
        if (!/duplicate|unique|23505/i.test(error.message + (error.code || ""))) {
            return { ok: false, error: "ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อเจ้าหน้าที่" };
        }
    }
    return { ok: false, error: "ไม่สามารถสร้างรหัสได้ กรุณาลองใหม่อีกครั้ง" };
}
