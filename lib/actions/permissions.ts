"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
    ALL_PERMISSION_KEYS, DEFAULT_PERMISSIONS, type StaffRole,
} from "@/lib/permissions";

/* ─── Guard: must be owner/admin of own clinic ─── */
async function requireAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: me } = await supabase
        .from("profiles")
        .select("id, role, clinic_id, approval_status")
        .eq("id", user.id)
        .single();

    if (!me) throw new Error("Profile not found");
    if (me.approval_status !== "approved") throw new Error("Account not approved");
    if (me.role !== "owner" && me.role !== "admin") throw new Error("Forbidden");

    return { supabase, me };
}

/* ─── Save effective permission map for a role ───
 *  - Compare incoming map against DEFAULT_PERMISSIONS[role]
 *  - Upsert only the diff into role_permissions
 *  - Delete rows that now match the default (clean state)
 */
export async function saveRolePermissions(
    role: StaffRole,
    permissionMap: Record<string, boolean>
) {
    const { supabase, me } = await requireAdmin();

    const defaults = DEFAULT_PERMISSIONS[role] || [];
    const overridesToUpsert: { clinic_id: string; role: StaffRole; permission_key: string; is_allowed: boolean; updated_by: string }[] = [];
    const overridesToDelete: string[] = [];

    for (const key of ALL_PERMISSION_KEYS) {
        const incomingAllowed = permissionMap[key] ?? false;
        const defaultAllowed = defaults.includes(key);

        if (incomingAllowed === defaultAllowed) {
            // matches default → remove any existing override
            overridesToDelete.push(key);
        } else {
            // differs from default → store override
            overridesToUpsert.push({
                clinic_id: me.clinic_id,
                role,
                permission_key: key,
                is_allowed: incomingAllowed,
                updated_by: me.id,
            });
        }
    }

    // Upsert
    if (overridesToUpsert.length > 0) {
        const { error } = await supabase
            .from("role_permissions")
            .upsert(overridesToUpsert, { onConflict: "clinic_id,role,permission_key" });
        if (error) return { success: false, error: error.message };
    }

    // Delete (use compound filter)
    if (overridesToDelete.length > 0) {
        const { error } = await supabase
            .from("role_permissions")
            .delete()
            .eq("clinic_id", me.clinic_id)
            .eq("role", role)
            .in("permission_key", overridesToDelete);
        if (error) return { success: false, error: error.message };
    }

    revalidatePath("/dashboard/staff");
    return { success: true };
}

/* ─── Reset all overrides for a role back to defaults ─── */
export async function resetRolePermissions(role: StaffRole) {
    const { supabase, me } = await requireAdmin();

    const { error } = await supabase
        .from("role_permissions")
        .delete()
        .eq("clinic_id", me.clinic_id)
        .eq("role", role);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true };
}
