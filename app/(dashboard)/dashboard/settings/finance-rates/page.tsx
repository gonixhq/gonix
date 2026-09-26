import { gatePermission } from "@/lib/auth/guard";
import { getFinanceRates } from "@/lib/actions/finance-rates";
import FinanceRatesClient from "./finance-rates-client";

export const dynamic = "force-dynamic";

export default async function FinanceRatesPage() {
    await gatePermission("settings.edit");
    const data = await getFinanceRates();
    return <FinanceRatesClient {...data} />;
}
