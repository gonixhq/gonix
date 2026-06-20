import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import AuditClient, { type ActivityEntry } from "./audit-client";

export default async function AuditPage() {
    await gatePermission("staff.manage");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: me } = await supabase
        .from("profiles")
        .select("clinic_id")
        .eq("id", user.id)
        .single();
    if (!me) redirect("/dashboard");

    // Pull last 200 activity rows + actor/target names
    const { data: logs } = await supabase
        .from("staff_activity_log")
        .select(`
            id, action, details, created_at,
            actor:actor_id ( id, full_name, role ),
            target:target_id ( id, full_name, role )
        `)
        .eq("clinic_id", me.clinic_id)
        .order("created_at", { ascending: false })
        .limit(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: ActivityEntry[] = (logs || []).map((l: any) => ({
        id: l.id,
        action: l.action,
        details: l.details || {},
        created_at: l.created_at,
        actor_name: l.actor?.full_name || "—",
        actor_role: l.actor?.role || null,
        target_name: l.target?.full_name || "—",
        target_role: l.target?.role || null,
    }));

    return <AuditClient entries={entries} />;
}
