import { redirect } from "next/navigation";
import { getEffectivePermissionsForUser } from "./permissions";

/**
 * Server-side guard for page-level permission check.
 * Usage in any server page:
 *   await gatePermission("patients.view");
 *   // ... rest of page
 *
 * Redirects to /dashboard if user lacks the permission.
 * Redirects to /pending-approval if user is not approved/active.
 * Redirects to /login if not logged in.
 */
export async function gatePermission(permKey: string, redirectTo = "/dashboard") {
    const { userId, isApproved, isActive, permissions } = await getEffectivePermissionsForUser();

    if (!userId) redirect("/login");
    if (!isApproved) redirect("/pending-approval");
    if (!isActive) redirect("/pending-approval?disabled=1");
    if (permissions[permKey] !== true) redirect(redirectTo);
}
