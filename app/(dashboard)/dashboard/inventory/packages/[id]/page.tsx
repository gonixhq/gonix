import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { notFound } from "next/navigation";
import { getPackagePurchases } from "@/lib/actions/packages";
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

    const purchasesRaw = await getPackagePurchases(id);
    // Flatten patient relation (Supabase returns as array)
    const purchases = purchasesRaw.map(p => ({
        ...p,
        patient: Array.isArray(p.patient) ? (p.patient[0] || null) : p.patient,
    }));

    return <PackageDetailClient pkg={pkg} purchases={purchases} />;
}
