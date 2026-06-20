import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";
import TopNavbar from "@/components/layout/top-navbar";
import { LanguageProvider } from "@/lib/i18n";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { PermissionProvider } from "@/lib/auth/permission-context";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, role, clinic_id, approval_status, is_active")
        .eq("id", user.id)
        .single();

    console.log("[Layout] profile:", JSON.stringify(profile), "error:", profileError?.message);

    // Block users with non-approved status
    if (profile && profile.approval_status && profile.approval_status !== "approved") {
        redirect("/pending-approval");
    }

    // Block disabled accounts (is_active = false)
    if (profile && profile.is_active === false) {
        redirect("/pending-approval?disabled=1");
    }

    // Load effective permissions (defaults + clinic overrides)
    const { permissions } = await getEffectivePermissionsForUser();

    // Fetch clinic name — multiple fallbacks
    let clinicName = "Clinic";

    if (profile?.clinic_id) {
        const { data: tenant, error: tenantError } = await supabase
            .from("tenants")
            .select("clinic_name, logo_url")
            .eq("id", profile.clinic_id)
            .single();
        console.log("[Layout] tenant:", JSON.stringify(tenant), "error:", tenantError?.message);
        if (tenant?.clinic_name) clinicName = tenant.clinic_name;
    }

    // Fallback: use clinic_name from signup metadata
    if (clinicName === "Clinic" && user.user_metadata?.clinic_name) {
        clinicName = user.user_metadata.clinic_name;
    }

    // Fetch logo
    const logoUrl = profile?.clinic_id ? (await supabase.from("tenants").select("logo_url").eq("id", profile.clinic_id).single()).data?.logo_url : undefined;

    // Fetch branch name (default_branch ของ user → fallback ไป branch แรกของ clinic)
    let branchName = "สำนักงานใหญ่";
    if (profile?.clinic_id) {
        const { data: staffRow } = await supabase
            .from("staff").select("default_branch_id").eq("profile_id", user.id).maybeSingle();
        const branchId = staffRow?.default_branch_id;
        if (branchId) {
            const { data: branch } = await supabase
                .from("branches").select("branch_name").eq("id", branchId).maybeSingle();
            if (branch?.branch_name) branchName = branch.branch_name;
        } else {
            const { data: firstBranch } = await supabase
                .from("branches").select("branch_name")
                .eq("clinic_id", profile.clinic_id).eq("is_active", true)
                .order("sort_order").limit(1).maybeSingle();
            if (firstBranch?.branch_name) branchName = firstBranch.branch_name;
        }
    }

    return (
        <LanguageProvider>
          <PermissionProvider permissions={permissions}>
            <div className="flex h-screen overflow-hidden">
                <div className="h-full hidden md:block">
                    <Sidebar clinicName={clinicName} branchName={branchName} role={profile?.role} permissions={permissions} />
                </div>
                <div className="flex flex-1 flex-col overflow-hidden">
                    <TopNavbar user={user} clinicName={clinicName} logoUrl={logoUrl} userName={profile?.full_name} userRole={profile?.role} />
                    <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in scroll-smooth">
                        {children}
                    </main>
                </div>
            </div>
          </PermissionProvider>
        </LanguageProvider>
    );
}
