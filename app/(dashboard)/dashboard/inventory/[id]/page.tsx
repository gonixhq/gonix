import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { notFound } from "next/navigation";
import { getInventoryAuditLogs, getItemLots } from "@/lib/actions/inventory";
import InventoryDetailClient from "./inventory-detail-client";

export const dynamic = "force-dynamic";

export default async function InventoryDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await gatePermission("inventory.view");
    const { id } = await params;
    const supabase = await createClient();

    const { data: item } = await supabase
        .from("inventory")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (!item) return notFound();

    // Fetch stock card history
    const { data: history } = await supabase
        .from("stock_card")
        .select(`
            id, tx_type, qty_delta, balance_after, cost_per_unit, total_cost,
            ref_vn, ref_inv_id, note, recorded_at,
            recorded_by:staff!stock_card_recorded_by_fkey(profiles(full_name))
        `)
        .eq("item_id", id)
        .order("recorded_at", { ascending: false })
        .limit(50);

    const [editLogs, lots] = await Promise.all([getInventoryAuditLogs(id), getItemLots(id)]);

    return <InventoryDetailClient item={item} history={history || []} editLogs={editLogs} lots={lots} />;
}
