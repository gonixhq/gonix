import { gatePermission } from "@/lib/auth/guard";
import { listStockCounts } from "@/lib/actions/consumables";
import StockCountClient from "./stock-count-client";

export const dynamic = "force-dynamic";

export default async function StockCountPage() {
    await gatePermission("inventory.view");
    const counts = await listStockCounts();
    return <StockCountClient counts={counts} />;
}
