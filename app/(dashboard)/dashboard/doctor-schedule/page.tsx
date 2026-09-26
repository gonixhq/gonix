import { gatePermission } from "@/lib/auth/guard";
import { getScheduleStaff, getScheduleRooms } from "@/lib/actions/doctor-shifts";
import { getDayAttendanceDetail } from "@/lib/actions/compensation";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { bangkokDate } from "@/lib/utils/date";
import DoctorScheduleClient from "./doctor-schedule-client";
import AttendancePanel from "./attendance-panel";

export const dynamic = "force-dynamic";

export default async function DoctorSchedulePage() {
    await gatePermission("staff.manage");
    const today = bangkokDate();
    const [staff, rooms, perms, attendance] = await Promise.all([
        getScheduleStaff(), getScheduleRooms(), getEffectivePermissionsForUser(), getDayAttendanceDetail(today),
    ]);
    return (
        <>
            <DoctorScheduleClient staff={staff} rooms={rooms} today={today} isOwner={perms.role === "owner"} />
            <div className="pb-24">
                <AttendancePanel today={today} initialRows={attendance} />
            </div>
        </>
    );
}
