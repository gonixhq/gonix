import { gatePermission } from "@/lib/auth/guard";
import { getScheduleStaff, getScheduleRooms } from "@/lib/actions/doctor-shifts";
import { bangkokDate } from "@/lib/utils/date";
import DoctorScheduleClient from "./doctor-schedule-client";

export const dynamic = "force-dynamic";

export default async function DoctorSchedulePage() {
    await gatePermission("staff.manage");
    const [staff, rooms] = await Promise.all([getScheduleStaff(), getScheduleRooms()]);
    return <DoctorScheduleClient staff={staff} rooms={rooms} today={bangkokDate()} />;
}
