import { gatePermission } from "@/lib/auth/guard";
import { getScheduleStaff, getScheduleRooms } from "@/lib/actions/doctor-shifts";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { bangkokDate } from "@/lib/utils/date";
import DoctorScheduleClient from "./doctor-schedule-client";

export const dynamic = "force-dynamic";

export default async function DoctorSchedulePage() {
    await gatePermission("staff.manage");
    const [staff, rooms, perms] = await Promise.all([getScheduleStaff(), getScheduleRooms(), getEffectivePermissionsForUser()]);
    return <DoctorScheduleClient staff={staff} rooms={rooms} today={bangkokDate()} isOwner={perms.role === "owner"} />;
}
