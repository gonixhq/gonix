import { gatePermission } from "@/lib/auth/guard";
import { getAllSoldPackages, getDeferredRevenueForecast } from "@/lib/actions/packages";
import PackagesSoldClient from "./packages-sold-client";

export const dynamic = "force-dynamic";

export default async function PackagesSoldPage() {
    await gatePermission("finance.view");
    const [rows, forecast] = await Promise.all([getAllSoldPackages(), getDeferredRevenueForecast()]);
    return <PackagesSoldClient rows={rows} forecast={forecast} />;
}
