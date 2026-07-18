import { gatePermission } from "@/lib/auth/guard";
import { getPreOrders, getPreOrderSettings } from "@/lib/actions/pre-order";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { listActiveServices } from "@/lib/actions/services";
import PreOrdersClient from "./pre-orders-client";

export const dynamic = "force-dynamic";

export default async function PreOrdersPage() {
    await gatePermission("pre_order.view");
    const [list, settings, services, me] = await Promise.all([
        getPreOrders(),
        getPreOrderSettings(),
        listActiveServices(),
        getEffectivePermissionsForUser(),
    ]);
    const svc = (services || []).map((s) => ({ id: s.id, name: s.service_name, price: Number(s.selling_price || 0) }));
    return (
        <PreOrdersClient
            initial={list}
            minDeposit={settings.min_deposit_amount}
            services={svc}
            canManage={!!me.permissions["pre_order.manage"]}
            canDecide={!!me.permissions["pre_order.decide"]}
            canExtend={!!me.permissions["pre_order.extend"]}
        />
    );
}
