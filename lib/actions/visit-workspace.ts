"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { BODY_CHART_BACKGROUND, type ChartSheet } from "@/lib/visit-workspace-types";

export async function saveVisitWorkspace(vn: string, input: { notes: string; sheets: ChartSheet[]; revision: string | null; previousNotes: string }) {
    try {
        const auth = await getEffectivePermissionsForUser();
        if (!auth.userId || !auth.clinicId || !auth.isApproved || !auth.isActive || !auth.permissions["visits.edit"]) throw Error("ไม่มีสิทธิ์บันทึกการตรวจ");
        if (typeof input.notes !== "string" || input.notes.length > 20000 || !Array.isArray(input.sheets) || input.sheets.length > 30) throw Error("บันทึกหรือจำนวนแผ่นวาดมากเกินกำหนด");
        const prefix = `${auth.clinicId}/visits/${vn}/workspace/`;
        const sheets = input.sheets.map(sheet => {
            if (!Number.isFinite(sheet.id) || typeof sheet.name !== "string" || sheet.name.length > 200 || !Array.isArray(sheet.strokes) || !Array.isArray(sheet.pins) || sheet.strokes.length > 2000 || sheet.pins.length > 500) throw Error("แผ่นวาดไม่ถูกต้อง");
            if (sheet.storagePath) {
                if (!sheet.storagePath.startsWith(prefix) || !/^[a-zA-Z0-9/_.-]+$/.test(sheet.storagePath) || sheet.storagePath.includes("..")) throw Error("ภาพไม่อยู่ใน visit นี้");
            } else if (!["", "/face-chart.png", BODY_CHART_BACKGROUND].includes(sheet.background)) throw Error("กรุณาอัปโหลดภาพผ่านหน้าตรวจ");
            if (!sheet.strokes.every(s => /^#[0-9a-f]{6}$/i.test(s.color) && typeof s.points === "string" && s.points.length < 200000 && /^[0-9., ]+$/.test(s.points))) throw Error("เส้นวาดไม่ถูกต้อง");
            if (!sheet.pins.every(p => Number.isFinite(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 600 && p.y >= 0 && p.y <= 800 && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0 && /^#[0-9a-f]{6}$/i.test(p.color))) throw Error("จุดบนภาพไม่ถูกต้อง");
            return { id: sheet.id, name: sheet.name, background: sheet.storagePath ? "" : sheet.background, ...(sheet.storagePath ? { storagePath: sheet.storagePath } : {}), strokes: sheet.strokes, pins: sheet.pins };
        });
        if (new TextEncoder().encode(JSON.stringify(sheets)).length > 700000) throw Error("แผ่นวาดมีรายละเอียดมากเกินไป กรุณาลดจำนวนเส้นก่อนบันทึก");
        const db = await createClient();
        const { data: visit, error } = await db.from("visits").select("aesthetic_records,status,service_category").eq("clinic_id", auth.clinicId).eq("vn", vn).single();
        if (error || !visit || visit.service_category !== "aesthetic") throw Error("ไม่พบ visit ความงาม");
        if (!["waiting", "triaged", "with_doctor", "with_nurse"].includes(visit.status)) throw Error("visit นี้สิ้นสุดหรือถูกยกเลิกแล้ว");
        const current = visit.aesthetic_records || {};
        if ((current.workspace_revision || null) !== input.revision || (current.treatment_notes || "") !== input.previousNotes) throw Error("มีการแก้ไขจากอีกหน้าจอ กรุณาคัดลอกบันทึกไว้แล้วโหลดข้อมูลใหม่");
        const revision = crypto.randomUUID();
        let query = db.from("visits").update({ aesthetic_records: { ...current, treatment_notes: input.notes, workspace_sheets: sheets, workspace_revision: revision, workspace_saved_by: auth.userId, workspace_saved_at: new Date().toISOString() } }).eq("clinic_id", auth.clinicId).eq("vn", vn).eq("status", visit.status);
        query = input.revision ? query.eq("aesthetic_records->>workspace_revision", input.revision) : query.is("aesthetic_records->>workspace_revision", null);
        query = current.treatment_notes == null ? query.is("aesthetic_records->>treatment_notes", null) : query.eq("aesthetic_records->>treatment_notes", current.treatment_notes);
        const result = await query.select("vn");
        if (result.error) throw Error("บันทึกไม่สำเร็จ กรุณาลองใหม่");
        if (!result.data?.length) throw Error("ข้อมูลเปลี่ยนระหว่างบันทึก กรุณาโหลดใหม่");
        revalidatePath(`/dashboard/visits/${vn}`);
        revalidatePath(`/dashboard/visits/${vn}/workspace`);
        return { success: true as const, revision };
    } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }; }
}
