"use server";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

type StaffRole =
    | "owner"
    | "admin"
    | "doctor"
    | "dentist"
    | "nurse"
    | "pharmacist"
    | "physio"
    | "receptionist"
    | "accountant";

type StaffAction =
    | "approve" | "reject" | "reapprove"
    | "change_role"
    | "disable" | "enable";

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
    if (me.role !== "owner" && me.role !== "admin") throw new Error("Forbidden — only owner/admin can manage staff");

    return { supabase, me };
}

/* ─── Activity logger (fire-and-forget, errors logged to console) ─── */
async function logActivity(
    supabase: SupabaseClient,
    args: {
        clinicId: string;
        actorId: string;
        targetId: string;
        action: StaffAction;
        details?: Record<string, unknown>;
    }
) {
    const { error } = await supabase.from("staff_activity_log").insert({
        clinic_id: args.clinicId,
        actor_id: args.actorId,
        target_id: args.targetId,
        action: args.action,
        details: args.details || {},
    });
    if (error) console.error("[staff_activity_log] insert failed:", error.message);
}

/* ─── Approve a pending profile ─── */
export async function approveStaff(profileId: string, finalRole: StaffRole) {
    const { supabase, me } = await requireAdmin();

    // Capture previous role to log diff
    const { data: prev } = await supabase
        .from("profiles")
        .select("requested_role, role")
        .eq("id", profileId)
        .single();

    const { error } = await supabase
        .from("profiles")
        .update({
            approval_status: "approved",
            role: finalRole,
            approved_by: me.id,
            approved_at: new Date().toISOString(),
            rejected_reason: null,
        })
        .eq("id", profileId)
        .eq("clinic_id", me.clinic_id);

    if (error) return { success: false, error: error.message };

    await logActivity(supabase, {
        clinicId: me.clinic_id, actorId: me.id, targetId: profileId,
        action: "approve",
        details: { requested_role: prev?.requested_role, final_role: finalRole },
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/audit");
    return { success: true };
}

/* ─── Reject a pending profile ─── */
export async function rejectStaff(profileId: string, reason: string) {
    const { supabase, me } = await requireAdmin();

    if (!reason || reason.trim().length < 3) {
        return { success: false, error: "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร" };
    }

    const { error } = await supabase
        .from("profiles")
        .update({
            approval_status: "rejected",
            rejected_reason: reason.trim(),
            approved_by: me.id,
            approved_at: new Date().toISOString(),
        })
        .eq("id", profileId)
        .eq("clinic_id", me.clinic_id);

    if (error) return { success: false, error: error.message };

    await logActivity(supabase, {
        clinicId: me.clinic_id, actorId: me.id, targetId: profileId,
        action: "reject",
        details: { reason: reason.trim() },
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/audit");
    return { success: true };
}

/* ─── Change a staff member's role ─── */
export async function changeStaffRole(profileId: string, newRole: StaffRole) {
    const { supabase, me } = await requireAdmin();

    if (profileId === me.id) {
        return { success: false, error: "ไม่สามารถเปลี่ยน role ของตัวเองได้" };
    }

    const { data: prev } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", profileId)
        .single();

    const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", profileId)
        .eq("clinic_id", me.clinic_id);

    if (error) return { success: false, error: error.message };

    await logActivity(supabase, {
        clinicId: me.clinic_id, actorId: me.id, targetId: profileId,
        action: "change_role",
        details: { from: prev?.role, to: newRole },
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/audit");
    return { success: true };
}

/* ─── Enable / Disable a staff account ─── */
export async function toggleStaffActive(profileId: string, isActive: boolean) {
    const { supabase, me } = await requireAdmin();

    if (profileId === me.id) {
        return { success: false, error: "ไม่สามารถปิดบัญชีของตัวเองได้" };
    }

    const { error } = await supabase
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", profileId)
        .eq("clinic_id", me.clinic_id);

    if (error) return { success: false, error: error.message };

    await logActivity(supabase, {
        clinicId: me.clinic_id, actorId: me.id, targetId: profileId,
        action: isActive ? "enable" : "disable",
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/audit");
    return { success: true };
}

/* ─── Re-approve a previously rejected user ─── */
export async function reapproveStaff(profileId: string, finalRole: StaffRole) {
    const { supabase, me } = await requireAdmin();

    const { error } = await supabase
        .from("profiles")
        .update({
            approval_status: "approved",
            role: finalRole,
            approved_by: me.id,
            approved_at: new Date().toISOString(),
            rejected_reason: null,
            is_active: true,
        })
        .eq("id", profileId)
        .eq("clinic_id", me.clinic_id);

    if (error) return { success: false, error: error.message };

    await logActivity(supabase, {
        clinicId: me.clinic_id, actorId: me.id, targetId: profileId,
        action: "reapprove",
        details: { final_role: finalRole },
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/audit");
    return { success: true };
}
