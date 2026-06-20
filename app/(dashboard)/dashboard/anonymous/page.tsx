import { gatePermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { getAnonCases, getAnonStats, getLabServices } from "@/lib/actions/anonymous";
import AnonymousClient from "./anonymous-client";

export const dynamic = "force-dynamic";

export default async function AnonymousPage() {
    await gatePermission("anon.view");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
        ? await supabase.from("profiles").select("clinic_id").eq("id", user.id).single()
        : { data: null };
    const clinicId = (profile?.clinic_id as string) || "";

    const [cases, stats, services] = await Promise.all([
        getAnonCases(),
        getAnonStats(),
        getLabServices(),
    ]);
    return <AnonymousClient cases={cases} stats={stats} services={services} clinicId={clinicId} />;
}
