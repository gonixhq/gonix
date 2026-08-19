"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// รูปผลตรวจแนบในใบ Laboratory Report (เช่น สลิป urinalysis จากเครื่อง) — เก็บใน
// lab_report_meta[sampleType].images[] (array ของ storage path) ทั้ง visits + anon_cases
// โชว์เฉพาะใบพิมพ์ในคลินิก (ไม่ส่งให้คนไข้ /result)

type Scope = "visit" | "anon";
const TABLE: Record<Scope, "visits" | "anon_cases"> = { visit: "visits", anon: "anon_cases" };
const MATCH_COL: Record<Scope, "vn" | "id"> = { visit: "vn", anon: "id" };

// รับเฉพาะรูปที่แสดงในใบพิมพ์ได้ (ไม่รับ PDF/HEIC เพราะ <img> เรนเดอร์ไม่ได้)
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const BUCKET = "clinic-assets";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string, userId: user.id };
}

function revalidate(scope: Scope, key: string) {
    if (scope === "visit") revalidatePath(`/dashboard/visits/${key}`);
    else revalidatePath(`/dashboard/anonymous/${key}`);
}

/** อ่าน lab_report_meta ของ row (visit/anon) */
async function readMeta(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any, scope: Scope, clinicId: string, key: string
): Promise<Record<string, Record<string, unknown>>> {
    const { data } = await supabase.from(TABLE[scope]).select("lab_report_meta")
        .eq(MATCH_COL[scope], key).eq("clinic_id", clinicId).maybeSingle();
    return (data?.lab_report_meta as Record<string, Record<string, unknown>>) || {};
}

/** อัปโหลดรูปผลตรวจ 1 ไฟล์ → เพิ่ม path เข้า meta[sampleType].images */
export async function uploadLabReportImage(
    scope: Scope, key: string, sampleType: string, formData: FormData
): Promise<{ ok: boolean; error?: string }> {
    try {
        const { supabase, clinicId } = await getCtx();
        const file = formData.get("file") as File | null;
        if (!file || file.size === 0) return { ok: false, error: "ไม่พบไฟล์" };
        if (file.size > MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 10MB" };
        if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: "รองรับเฉพาะรูป JPG / PNG / WebP" };

        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const uid = crypto.randomUUID();
        const path = `${clinicId}/lab-report/${scope}/${key}/${uid}.${ext}`;
        const buffer = await file.arrayBuffer();
        const { error: upErr } = await supabase.storage.from(BUCKET)
            .upload(path, buffer, { contentType: file.type, upsert: false });
        if (upErr) return { ok: false, error: `อัปโหลดไม่สำเร็จ: ${upErr.message}` };

        const meta = await readMeta(supabase, scope, clinicId, key);
        const st = sampleType || "";
        const cur = (meta[st] || {}) as Record<string, unknown>;
        const images = Array.isArray(cur.images) ? (cur.images as string[]) : [];
        meta[st] = { ...cur, images: [...images, path] };
        const { error: dbErr } = await supabase.from(TABLE[scope])
            .update({ lab_report_meta: meta }).eq(MATCH_COL[scope], key).eq("clinic_id", clinicId);
        if (dbErr) {
            await supabase.storage.from(BUCKET).remove([path]); // rollback
            return { ok: false, error: `บันทึกไม่สำเร็จ: ${dbErr.message}` };
        }
        revalidate(scope, key);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** ลบรูปผลตรวจ 1 ไฟล์ ออกจาก meta + storage */
export async function removeLabReportImage(
    scope: Scope, key: string, sampleType: string, path: string
): Promise<{ ok: boolean; error?: string }> {
    try {
        const { supabase, clinicId } = await getCtx();
        const meta = await readMeta(supabase, scope, clinicId, key);
        const st = sampleType || "";
        const cur = (meta[st] || {}) as Record<string, unknown>;
        const images = Array.isArray(cur.images) ? (cur.images as string[]) : [];
        meta[st] = { ...cur, images: images.filter((p) => p !== path) };
        await supabase.from(TABLE[scope]).update({ lab_report_meta: meta })
            .eq(MATCH_COL[scope], key).eq("clinic_id", clinicId);
        // ลบไฟล์จริง (best-effort) — เฉพาะไฟล์ในคลินิกตัวเอง
        if (path.startsWith(`${clinicId}/`)) await supabase.storage.from(BUCKET).remove([path]);
        revalidate(scope, key);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/** เซ็น URL (signed, 1 ชม.) จาก storage path — ใช้ทั้งหน้าแก้ไข (thumbnail) และหน้าพิมพ์ */
export async function signLabReportImages(paths: string[]): Promise<string[]> {
    if (!paths || paths.length === 0) return [];
    try {
        const { supabase } = await getCtx();
        const signed = await Promise.all(paths.map(async (p) => {
            const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p, 3600);
            return data?.signedUrl || "";
        }));
        return signed;
    } catch {
        return paths.map(() => "");
    }
}
