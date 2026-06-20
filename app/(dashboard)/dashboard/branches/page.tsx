import { createClient } from "@/lib/supabase/server";
import BranchesClient, { Branch } from "./branches-client";

export default async function BranchesPage() {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("branches")
        .select("id, branch_code, branch_name, branch_name_en, ownership_type, jv_partner_name, jv_share_pct, phone, address, email, tax_id, is_active, sort_order, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) {
        console.error("[branches] fetch error:", error.message);
    }

    return <BranchesClient initialBranches={(data as Branch[]) || []} />;
}
