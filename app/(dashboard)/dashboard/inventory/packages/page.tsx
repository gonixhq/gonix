import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import PackagesClient from "./packages-client";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
    await gatePermission("inventory.view");
    const supabase = await createClient();

    const { data: packages } = await supabase
        .from("service_packages")
        .select("id, code, name, description, category, total_sessions, price, validity_days, is_active, sales_commission_pct, commission_doctor_pct, commission_nurse_pct, max_discount_pct")
        .order("is_active", { ascending: false })
        .order("category")
        .order("name");

    // สถิติต่อคอส: จำนวนที่ขาย + ครั้งที่ใช้ไป + คอสลูกค้าใกล้หมดอายุ (30 วัน ยังใช้ไม่ครบ)
    const { data: purchaseCounts } = await supabase
        .from("patient_packages")
        .select("package_id, status, total_sessions, used_sessions, expires_at");

    const now = Date.now();
    const DAY = 86400000;
    const agg: Record<string, { active: number; total: number; sold: number; used: number; expiringSoon: number }> = {};
    for (const p of purchaseCounts || []) {
        const key = p.package_id as string;
        if (!key) continue;
        const a = (agg[key] = agg[key] || { active: 0, total: 0, sold: 0, used: 0, expiringSoon: 0 });
        a.total++;
        if (p.status === "active") a.active++;
        const total = Number(p.total_sessions || 0);
        const used = Number(p.used_sessions || 0);
        a.sold += total;
        a.used += used;
        if (p.status === "active" && used < total && p.expires_at) {
            const daysLeft = (new Date(p.expires_at as string).getTime() - now) / DAY;
            if (daysLeft >= 0 && daysLeft <= 30) a.expiringSoon++;
        }
    }

    const items = (packages || []).map(p => {
        const a = agg[p.id];
        const sold = a?.sold || 0, used = a?.used || 0;
        return {
            ...p,
            active_purchases: a?.active || 0,
            total_purchases: a?.total || 0,
            sold_sessions: sold,
            used_sessions: used,
            utilization_pct: sold > 0 ? Math.round((used / sold) * 100) : 0,
            expiring_soon: a?.expiringSoon || 0,
        };
    });

    return <PackagesClient packages={items} />;
}
