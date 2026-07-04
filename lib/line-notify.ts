// Best-effort LINE notifications → ผู้ใช้ในระบบ (profiles.line_user_id)
// ใช้ในโมดูลตารางเวร: แจ้งพนักงานเมื่อเวรเปลี่ยน / แจ้ง owner เมื่อมีตารางรออนุมัติ
// ทุกฟังก์ชัน degrade เงียบ: ถ้าไม่มี token/ยังไม่ผูก LINE → ข้ามไป ไม่ throw
import { pushLineText } from "@/lib/line";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function pushTo(lineIds: string[], text: string) {
    for (const id of [...new Set(lineIds.filter(Boolean))]) {
        try { await pushLineText(id, text); } catch { /* best-effort */ }
    }
}

/** แจ้งเตือนตาม profile id */
export async function notifyProfileIds(supabase: any, profileIds: string[], text: string) {
    const ids = [...new Set(profileIds.filter(Boolean))];
    if (ids.length === 0) return;
    try {
        const { data } = await supabase.from("profiles").select("line_user_id").in("id", ids);
        await pushTo((data || []).map((p: any) => p.line_user_id as string), text);
    } catch { /* best-effort */ }
}

/** แจ้งเตือนตาม staff id (map staff → profile → line_user_id) */
export async function notifyStaffIds(supabase: any, staffIds: string[], text: string) {
    const ids = [...new Set(staffIds.filter(Boolean))];
    if (ids.length === 0) return;
    try {
        const { data } = await supabase.from("staff").select("profile_id").in("id", ids);
        await notifyProfileIds(supabase, (data || []).map((s: any) => s.profile_id as string), text);
    } catch { /* best-effort */ }
}

/** แจ้งเตือน owner ทุกคนในคลินิก */
export async function notifyOwners(supabase: any, clinicId: string, text: string) {
    try {
        const { data } = await supabase.from("profiles").select("line_user_id").eq("clinic_id", clinicId).eq("role", "owner");
        await pushTo((data || []).map((p: any) => p.line_user_id as string), text);
    } catch { /* best-effort */ }
}
