import { gatePermission } from "@/lib/auth/guard";
import { getAllSoldPackages } from "@/lib/actions/packages";
import PackagesSoldClient from "./packages-sold-client";

export const dynamic = "force-dynamic";

export default async function PackagesSoldPage() {
    await gatePermission("finance.view");
    const rows = await getAllSoldPackages();
    return <PackagesSoldClient rows={rows} />;
}
