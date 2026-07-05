import { gatePermission } from "@/lib/auth/guard";
import { getScheduleRooms } from "@/lib/actions/doctor-shifts";
import { getConsumableItems } from "@/lib/actions/consumables";
import ParClient from "./par-client";

export const dynamic = "force-dynamic";

export default async function ParPage() {
    await gatePermission("inventory.view");
    const [rooms, items] = await Promise.all([getScheduleRooms(), getConsumableItems()]);
    return <ParClient rooms={rooms} items={items} />;
}
