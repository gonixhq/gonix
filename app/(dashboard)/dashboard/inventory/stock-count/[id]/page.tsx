import { gatePermission } from "@/lib/auth/guard";
import { notFound } from "next/navigation";
import { getStockCount } from "@/lib/actions/consumables";
import CountClient from "./count-client";

export const dynamic = "force-dynamic";

export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await gatePermission("inventory.view");
    const { id } = await params;
    const { header, lines } = await getStockCount(id);
    if (!header) return notFound();
    return <CountClient id={id} header={header} lines={lines} />;
}
