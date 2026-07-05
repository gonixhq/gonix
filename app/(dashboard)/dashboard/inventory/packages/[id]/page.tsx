import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { notFound } from "next/navigation";
import { getPackagePurchases, getPackagePriceHistory, getBundleComponents } from "@/lib/actions/packages";
import { getConsumableItems } from "@/lib/actions/consumables";
import PackageDetailClient from "./package-detail-client";

export const dynamic = "force-dynamic";

export default async function PackageDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await gatePermission("inventory.view");
    const { id } = await params;
    const supabase = await createClient();

    const { data: pkg } = await supabase
        .from("service_packages")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (!pkg) return notFound();

    const [purchasesRaw, priceHistory, bundleComponents, allPkgRes, inventoryItems] = await Promise.all([
        getPackagePurchases(id),
        getPackagePriceHistory(id),
        getBundleComponents(id),
        // คอสเดี่ยว active อื่นๆ ให้เลือกเป็น component (ไม่รวมตัวเอง/ไม่รวม bundle อื่น)
        supabase
            .from("service_packages")
            .select("id, code, name, category, price, total_sessions")
            .eq("is_active", true)
            .eq("is_bundle", false)
            .neq("id", id)
            .order("name"),
        getConsumableItems(),
    ]);
    // Flatten patient relation (Supabase returns as array)
    const purchases = purchasesRaw.map(p => ({
        ...p,
        patient: Array.isArray(p.patient) ? (p.patient[0] || null) : p.patient,
    }));

    return (
        <PackageDetailClient
            pkg={pkg}
            purchases={purchases}
            priceHistory={priceHistory}
            bundleComponents={bundleComponents}
            candidatePackages={allPkgRes.data || []}
            inventoryItems={inventoryItems}
        />
    );
}
