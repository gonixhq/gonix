import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import InventoryClient from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
    await gatePermission("inventory.view");
    const supabase = await createClient();

    const { data: items } = await supabase
        .from("inventory")
        .select("id, item_code, item_name, generic_name, category, dosage_form, strength, unit, stock_qty, min_stock, cost_price, sell_price, is_active, expiry_date")
        .order("item_name", { ascending: true });

    return <InventoryClient items={items || []} />;
}
