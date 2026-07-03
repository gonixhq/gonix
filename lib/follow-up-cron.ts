import { createServiceClient } from "@/lib/supabase/service";
import { pushLineText } from "@/lib/line";

const FALLBACK_MINUTES = 15;

/** ส่งข้อความติดตามผลอัตโนมัติทาง LINE สำหรับ task ที่ครบกำหนดวันนี้ (cron รายวัน) */
export async function runFollowUpReminders(): Promise<{ sent: number; skipped: number }> {
    const supabase = createServiceClient();
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    const { data: tasks } = await supabase.from("follow_up_tasks")
        .select("id, hn, clinic_id, service_name").eq("due_date", today).eq("status", "pending").is("auto_sent_at", null).limit(500);
    let sent = 0, skipped = 0;
    for (const t of tasks || []) {
        const { data: pat } = await supabase.from("patients").select("first_name, last_name, line_user_id").eq("hn", t.hn).eq("clinic_id", t.clinic_id).maybeSingle();
        if (!pat?.line_user_id) { skipped++; continue; }
        const name = `${pat.first_name || ""}`.trim();
        const msg = `สวัสดีค่ะ${name ? ` คุณ${name}` : ""} 🌿\nคลินิกขอติดตามอาการหลังทำ${t.service_name ? ` "${t.service_name}"` : "หัตถการ"} ค่ะ\nเป็นอย่างไรบ้างคะ? หากมีอาการผิดปกติ (บวม แดง ปวดมาก) แจ้งกลับได้ทันทีนะคะ 🙏`;
        const r = await pushLineText(pat.line_user_id as string, msg);
        if (r.ok) {
            await supabase.from("follow_up_tasks").update({ auto_sent_at: new Date().toISOString() }).eq("id", t.id);
            await supabase.from("follow_up_task_log").insert({ clinic_id: t.clinic_id, task_id: t.id, action: "auto_sent" });
            sent++;
        } else skipped++;
    }
    return { sent, skipped };
}

/** Escalation fallback — เคส escalate แต่ยังไม่ได้รับการแก้ไขเกิน 15 นาที → แจ้ง owner (cron ทุก ~5 นาที) */
export async function runEscalationFallback(): Promise<{ notified: number }> {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - FALLBACK_MINUTES * 60000).toISOString();
    const { data: tasks } = await supabase.from("follow_up_tasks")
        .select("id, hn, clinic_id, service_name, escalated_at")
        .not("escalated_at", "is", null).is("fallback_at", null)
        .lt("escalated_at", cutoff).not("status", "in", "(done,cancelled)").limit(200);
    let notified = 0;
    for (const t of tasks || []) {
        // owner ของคลินิกที่ผูก LINE
        const { data: owners } = await supabase.from("profiles").select("line_user_id").eq("clinic_id", t.clinic_id).eq("role", "owner").not("line_user_id", "is", null);
        const { data: pat } = await supabase.from("patients").select("first_name, last_name, phone").eq("hn", t.hn).eq("clinic_id", t.clinic_id).maybeSingle();
        const pname = pat ? `${pat.first_name || ""} ${pat.last_name || ""}`.trim() : t.hn;
        const msg = `⏰🚨 Escalation ไม่ได้รับการตอบสนอง\nเคส: ${pname} (HN ${t.hn})\nบริการ: ${t.service_name || "-"}\nแจ้งแพทย์เจ้าของไข้เกิน ${FALLBACK_MINUTES} นาทีแล้วยังไม่ปิดเคส\nกรุณาช่วยตรวจสอบด่วน${pat?.phone ? `\nโทร: ${pat.phone}` : ""}`;
        let anySent = false;
        for (const o of owners || []) { const r = await pushLineText(o.line_user_id as string, msg); if (r.ok) anySent = true; }
        await supabase.from("follow_up_tasks").update({ fallback_at: new Date().toISOString() }).eq("id", t.id);
        await supabase.from("follow_up_task_log").insert({ clinic_id: t.clinic_id, task_id: t.id, action: "fallback", note: anySent ? "แจ้ง owner แล้ว" : "owner ยังไม่ผูก LINE" });
        notified++;
    }
    return { notified };
}
