import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import PatientsClient from "./patients-client";

export default async function PatientsPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    await gatePermission("patients.view");
    const params = await searchParams;
    const search = params.q || "";
    const supabase = await createClient();

    let query = supabase
        .from("patients")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);

    if (search) {
        query = query.or(
            `hn.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`
        );
    }

    const { data: patients, error } = await query;

    if (error) {
        console.error("[patients] query error:", error);
    }
    console.log("[patients] count:", patients?.length ?? 0);

    // Get user role for delete button visibility (owner-only)
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
        ? await supabase.from("profiles").select("role").eq("id", user.id).single()
        : { data: null };
    const isOwner = profile?.role === "owner";

    return <PatientsClient patients={patients || []} search={search} isOwner={isOwner} />;
}
