import { gatePermission } from "@/lib/auth/guard";
import { listRooms, listAvailableDoctors } from "@/lib/actions/rooms";
import RoomsClient from "./rooms-client";

export default async function RoomsPage() {
    await gatePermission("rooms.manage");
    const [rooms, doctors] = await Promise.all([
        listRooms(),
        listAvailableDoctors(),
    ]);
    return <RoomsClient initialRooms={rooms} availableDoctors={doctors} />;
}
