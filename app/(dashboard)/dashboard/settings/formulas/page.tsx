import { gatePermission } from "@/lib/auth/guard";
import { listPresets, listPresetInventory } from "@/lib/actions/presets";
import FormulasClient from "./formulas-client";

export const dynamic = "force-dynamic";

export default async function FormulasPage() {
    await gatePermission("settings.edit");
    const [presets, inventory] = await Promise.all([listPresets(), listPresetInventory()]);
    return <FormulasClient presets={presets} inventory={inventory} />;
}
