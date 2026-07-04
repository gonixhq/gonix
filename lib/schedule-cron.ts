import { createServiceClient } from "@/lib/supabase/service";
import { pushLineText } from "@/lib/line";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/**
 * เตือนพนักงานทาง LINE เมื่อเลยเวลาเลิกงาน (จากตารางเวร) แล้วแต่ยังไม่ได้เช็คเอาท์
 * เงื่อนไข: มี staff_time_logs วันนี้ที่ยังไม่ปิด (clock_out=null) + มีเวรวันนี้ที่ end_time ผ่านไปแล้ว
 * ส่งเฉพาะช่วง 0–WINDOW นาทีหลังเลิกงาน (กันสแปมทุกครั้งที่ cron รัน)
 */
export async function runForgotCheckoutReminders(): Promise<{ reminded: number; skipped: number }> {
    const supabase = createServiceClient();
    const nowBkk = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }); // "YYYY-MM-DD HH:MM:SS"
    const today = nowBkk.slice(0, 10);
    const nowMin = toMin(nowBkk.slice(11, 16));
    const WINDOW = 90;

    const { data: openLogs } = await supabase
        .from("staff_time_logs")
        .select("staff_id")
        .eq("work_date", today)
        .is("clock_out", null);
    if (!openLogs || openLogs.length === 0) return { reminded: 0, skipped: 0 };

    const staffIds = [...new Set(openLogs.map((l) => l.staff_id as string))];
    const { data: shifts } = await supabase
        .from("doctor_shifts")
        .select("doctor_staff_id, end_time")
        .eq("shift_date", today)
        .in("doctor_staff_id", staffIds);

    // เวลาเลิกงานล่าสุดของแต่ละคนวันนี้
    const endByStaff = new Map<string, string>();
    for (const s of shifts || []) {
        const e = (s.end_time as string).slice(0, 5);
        const cur = endByStaff.get(s.doctor_staff_id as string);
        if (!cur || e > cur) endByStaff.set(s.doctor_staff_id as string, e);
    }

    // เฉพาะคนที่เลิกงานแล้วภายใน WINDOW นาที
    const targets = staffIds.filter((id) => {
        const end = endByStaff.get(id);
        if (!end) return false;
        const diff = nowMin - toMin(end);
        return diff > 0 && diff <= WINDOW;
    });
    if (targets.length === 0) return { reminded: 0, skipped: 0 };

    const { data: staffRows } = await supabase.from("staff").select("id, profile_id").in("id", targets);
    const profIds = (staffRows || []).map((s) => s.profile_id as string).filter(Boolean);
    if (profIds.length === 0) return { reminded: 0, skipped: targets.length };
    const { data: profs } = await supabase.from("profiles").select("id, line_user_id").in("id", profIds);
    const lineByProf = new Map((profs || []).map((p) => [p.id as string, p.line_user_id as string]));
    const profByStaff = new Map((staffRows || []).map((s) => [s.id as string, s.profile_id as string]));

    let reminded = 0, skipped = 0;
    for (const id of targets) {
        const lineId = lineByProf.get(profByStaff.get(id) || "");
        if (!lineId) { skipped++; continue; }
        const end = endByStaff.get(id);
        const r = await pushLineText(lineId, `⏰ ยังไม่ได้เช็คเอาท์\nคุณเลิกงานตามตารางเวรเวลา ${end} แล้ว แต่ยังไม่ได้กดออกงาน\nกรุณากดออกงานเพื่อบันทึกเวลาทำงานให้ถูกต้อง 🙏`);
        if (r.ok) reminded++; else skipped++;
    }
    return { reminded, skipped };
}
