import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import InventoryForm from "../../new/inventory-form";

export const dynamic = "force-dynamic";

export default async function InventoryEditPage({ params }: { params: Promise<{ id: string }> }) {
    await gatePermission("inventory.edit");
    const { id } = await params;
    const supabase = await createClient();

    const { data: item } = await supabase.from("inventory").select("*").eq("id", id).maybeSingle();
    if (!item) return notFound();

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 pt-1">
                <Link href={`/dashboard/inventory/${id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800 font-medium">
                    <ArrowLeft className="h-4 w-4" /> กลับ
                </Link>
                <span className="text-slate-300">·</span>
                <h1 className="text-base font-bold text-slate-800">แก้ไขรายละเอียด — {item.item_name}</h1>
            </div>
            <InventoryForm item={item} />
        </div>
    );
}
