import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import PackagesClient from "./packages-client";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
    await gatePermission("inventory.view");
    const supabase = await createClient();

    const { data: packages } = await supabase
        .from("service_packages")
        .select("id, code, name, description, category, total_sessions, price, validity_days, is_active")
        .order("is_active", { ascending: false })
        .order("category")
        .order("name");

    // Count active purchases per package
    const { data: purchaseCounts } = await supabase
        .from("patient_packages")
        .select("package_id, status");

    const countMap: Record<string, { active: number; total: number }> = {};
    for (const p of purchaseCounts || []) {
        const key = p.package_id as string;
        if (!countMap[key]) countMap[key] = { active: 0, total: 0 };
        countMap[key].total++;
        if (p.status === "active") countMap[key].active++;
    }

    const items = (packages || []).map(p => ({
        ...p,
        active_purchases: countMap[p.id]?.active || 0,
        total_purchases: countMap[p.id]?.total || 0,
    }));

    return <PackagesClient packages={items} />;
}
