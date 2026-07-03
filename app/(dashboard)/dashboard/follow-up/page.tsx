import { gatePermission } from "@/lib/auth/guard";
import { getFollowUpsForDate } from "@/lib/actions/follow-up";
import FollowUpClient from "./follow-up-client";

export const dynamic = "force-dynamic";

function bkkToday() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }); }

export default async function FollowUpPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
    await gatePermission("patients.view");
    const sp = await searchParams;
    const date = sp.date || bkkToday();
    const tasks = await getFollowUpsForDate(date, { includeOverdue: date === bkkToday() });
    return <FollowUpClient tasks={tasks} date={date} today={bkkToday()} />;
}
