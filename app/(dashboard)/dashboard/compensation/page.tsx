import { gatePermission } from "@/lib/auth/guard";
import { getStaffCompensation } from "@/lib/actions/compensation";
import { getScheduleStaff } from "@/lib/actions/doctor-shifts";
import { bangkokDate } from "@/lib/utils/date";
import CompensationClient from "./compensation-client";

export const dynamic = "force-dynamic";

export default async function CompensationPage() {
    await gatePermission("staff.manage");
    const month = bangkokDate().slice(0, 7); // YYYY-MM
    const [rows, staff] = await Promise.all([getStaffCompensation(month), getScheduleStaff()]);
    return <CompensationClient initialMonth={month} initialRows={rows} staff={staff} />;
}
