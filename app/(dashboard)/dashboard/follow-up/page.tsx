import { gatePermission } from "@/lib/auth/guard";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { getFollowUpsForDate, getClinicReviewUrl } from "@/lib/actions/follow-up";
import FollowUpClient from "./follow-up-client";

export const dynamic = "force-dynamic";

function bkkToday() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }); }

export default async function FollowUpPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
    await gatePermission("patients.view");
    const sp = await searchParams;
    const date = sp.date || bkkToday();
    const [tasks, reviewUrl, perms] = await Promise.all([
        getFollowUpsForDate(date, { includeOverdue: date === bkkToday() }),
        getClinicReviewUrl(),
        getEffectivePermissionsForUser(),
    ]);
    const canEditReview = perms.role === "owner" || perms.role === "admin";
    return <FollowUpClient tasks={tasks} date={date} today={bkkToday()} reviewUrl={reviewUrl} canEditReview={canEditReview} />;
}
