import { createClient } from "@/lib/supabase/server";
import { effectivePermissions, type StaffRole } from "@/lib/permissions";

interface UserPermissions {
    userId: string | null;
    role: StaffRole | null;
    clinicId: string | null;
    isApproved: boolean;
    isActive: boolean;
    permissions: Record<string, boolean>;
}

/**
 * Server-side: load current user's role + effective permissions
 * (merges DEFAULT_PERMISSIONS with role_permissions overrides for this clinic)
 */
export async function getEffectivePermissionsForUser(): Promise<UserPermissions> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { userId: null, role: null, clinicId: null, isApproved: false, isActive: false, permissions: {} };
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, clinic_id, approval_status, is_active")
        .eq("id", user.id)
        .single();

    if (!profile) {
        return { userId: user.id, role: null, clinicId: null, isApproved: false, isActive: false, permissions: {} };
    }

    const isApproved = profile.approval_status === "approved";
    const isActive = profile.is_active !== false;

    if (!isApproved || !isActive) {
        return {
            userId: user.id,
            role: profile.role as StaffRole,
            clinicId: profile.clinic_id,
            isApproved, isActive,
            permissions: {},
        };
    }

    const { data: overrides } = await supabase
        .from("role_permissions")
        .select("permission_key, is_allowed")
        .eq("clinic_id", profile.clinic_id)
        .eq("role", profile.role);

    return {
        userId: user.id,
        role: profile.role as StaffRole,
        clinicId: profile.clinic_id,
        isApproved, isActive,
        permissions: effectivePermissions(profile.role as StaffRole, overrides || []),
    };
}

/** Server-side: does current user have this permission? */
export async function can(permissionKey: string): Promise<boolean> {
    const { permissions } = await getEffectivePermissionsForUser();
    return permissions[permissionKey] ?? false;
}
