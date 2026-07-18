import { createServiceClient } from "@/lib/supabase/service";

// actor สำหรับ event ที่ระบบทำเอง (cron) — nil uuid + actor_role='system'
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

/**
 * T15: มัดจำหมดอายุ → แปลงเป็นเครดิต (P2) หรือ forfeit ตาม pre_order_settings
 * รันวันละครั้ง (ผ่าน /api/cron/pre-orders/expire + CRON_SECRET)
 */
export async function runPreOrderExpiry() {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();

    const { data: expired } = await supabase.from("pre_orders")
        .select("id, clinic_id, hn, status, deposit_expires_at")
        .in("status", ["pending_doctor", "scheduled"])
        .lt("deposit_expires_at", nowIso);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (expired || []) as any[];
    if (rows.length === 0) return { expired: 0 };

    // expiry_action ต่อคลินิก
    const clinicIds = Array.from(new Set(rows.map(r => r.clinic_id)));
    const { data: settingsRows } = await supabase.from("pre_order_settings")
        .select("clinic_id, expiry_action").in("clinic_id", clinicIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionByClinic = new Map((settingsRows || []).map((s: any) => [s.clinic_id, s.expiry_action]));

    let count = 0;
    for (const po of rows) {
        // ยอดมัดจำที่รับมา
        const { data: deps } = await supabase.from("deposit_ledger")
            .select("amount").eq("pre_order_id", po.id).eq("entry_type", "deposit_received");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const depositTotal = (deps || []).reduce((s: number, d: any) => s + Number(d.amount), 0);
        const action = actionByClinic.get(po.clinic_id) || "convert_to_credit";
        const entryType = action === "forfeit" ? "forfeited" : "converted_to_credit";

        // pending_doctor/scheduled → expired (trigger อนุญาต)
        const { error } = await supabase.from("pre_orders").update({ status: "expired" }).eq("id", po.id);
        if (error) continue;

        if (depositTotal > 0) {
            await supabase.from("deposit_ledger").insert({
                clinic_id: po.clinic_id, hn: po.hn, pre_order_id: po.id, entry_type: entryType,
                amount: depositTotal, reason: "หมดอายุมัดจำอัตโนมัติ (cron)", created_by: SYSTEM_ACTOR,
            });
        }
        await supabase.from("pre_order_audit_log").insert({
            clinic_id: po.clinic_id, pre_order_id: po.id, from_status: po.status, to_status: "expired",
            actor_id: SYSTEM_ACTOR, actor_role: "system", reason: "auto-expire",
            metadata: { deposit: depositTotal, action: entryType },
        });
        count++;
        // TODO(LINE): แจ้งคนไข้ว่ามัดจำถูกแปลงเป็นเครดิต (เมื่อ wire LINE OA sends)
    }
    return { expired: count };
}
