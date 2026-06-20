import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StaffClient, {
    type PendingProfile,
    type StaffProfile,
    type PermissionOverride,
} from "./staff-client";

export default async function StaffPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Guard: only owner/admin
    const { data: me } = await supabase
        .from("profiles")
        .select("id, role, clinic_id, approval_status")
        .eq("id", user.id)
        .single();

    if (!me) redirect("/dashboard");
    if (me.approval_status !== "approved") redirect("/pending-approval");
    if (me.role !== "owner" && me.role !== "admin") redirect("/dashboard");

    // Pending
    const { data: pending } = await supabase
        .from("profiles")
        .select("id, full_name, phone, requested_role, approval_status, created_at")
        .eq("clinic_id", me.clinic_id)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: true });

    // Approved + Rejected
    const { data: staff } = await supabase
        .from("profiles")
        .select("id, full_name, phone, role, approval_status, is_active, last_seen_at, created_at, rejected_reason, approved_at")
        .eq("clinic_id", me.clinic_id)
        .neq("approval_status", "pending")
        .order("created_at", { ascending: true });

    // Role permission overrides
    const { data: overrides } = await supabase
        .from("role_permissions")
        .select("role, permission_key, is_allowed")
        .eq("clinic_id", me.clinic_id);

    const pendingProfiles: PendingProfile[] = (pending || []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        requested_role: p.requested_role,
        created_at: p.created_at,
    }));

    const staffProfiles: StaffProfile[] = (staff || []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        role: p.role,
        approval_status: p.approval_status,
        is_active: p.is_active,
        last_seen_at: p.last_seen_at,
        created_at: p.created_at,
        rejected_reason: p.rejected_reason,
        approved_at: p.approved_at,
        is_me: p.id === me.id,
    }));

    const permissionOverrides: PermissionOverride[] = (overrides || []).map((o) => ({
        role: o.role,
        permission_key: o.permission_key,
        is_allowed: o.is_allowed,
    }));

    return (
        <StaffClient
            pending={pendingProfiles}
            staff={staffProfiles}
            overrides={permissionOverrides}
        />
    );
}
