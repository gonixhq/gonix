import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PendingApprovalClient from "./pending-approval-client";

export default async function PendingApprovalPage({
    searchParams,
}: {
    searchParams: Promise<{ disabled?: string }>;
}) {
    const supabase = await createClient();
    const sp = await searchParams;
    const isDisabledFlag = sp?.disabled === "1";

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select(`
            full_name, requested_role, approval_status, rejected_reason, is_active, created_at,
            tenants!profiles_clinic_id_fkey ( clinic_name )
        `)
        .eq("id", user.id)
        .single();

    // Disabled account (approved but is_active = false)
    const isDisabled = isDisabledFlag || (profile?.approval_status === "approved" && profile.is_active === false);

    // ถ้า approved + active → เข้า dashboard ปกติ
    if (profile?.approval_status === "approved" && profile.is_active !== false) {
        redirect("/dashboard");
    }

    // Determine display status — disabled takes priority
    const displayStatus: "pending" | "rejected" | "disabled" = isDisabled
        ? "disabled"
        : (profile?.approval_status === "rejected" ? "rejected" : "pending");

    return (
        <PendingApprovalClient
            email={user.email || ""}
            fullName={profile?.full_name || user.email || ""}
            requestedRole={profile?.requested_role || null}
            status={displayStatus}
            rejectedReason={profile?.rejected_reason || null}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clinicName={(profile?.tenants as any)?.clinic_name || null}
            createdAt={profile?.created_at || null}
        />
    );
}
