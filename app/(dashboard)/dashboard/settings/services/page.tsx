import { gatePermission } from "@/lib/auth/guard";
import { listAllServices, listInventoryForPicker } from "@/lib/actions/services";
import ServicesClient from "./services-client";

export default async function ServicesPage() {
    await gatePermission("settings.edit");
    const [services, inventory] = await Promise.all([listAllServices(), listInventoryForPicker()]);
    return <ServicesClient initialServices={services} inventory={inventory} />;
}
