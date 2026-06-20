import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import InventoryForm from "./inventory-form";

export default async function NewInventoryPage() {
    const supabase = await createClient();

    // We fetch categories or existing supply presets if needed here, 
    // but the form can just be static or fetch its own data.

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/inventory"
                    className="h-10 w-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-slate-800">เพิ่มรายการใหม่</h1>
                    <p className="text-sm text-slate-500">สร้างรายการยา เวชภัณฑ์ หรือบริการใหม่</p>
                </div>
            </div>

            <InventoryForm />
        </div>
    );
}
