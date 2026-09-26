import { gatePermission } from "@/lib/auth/guard";
import { getPreOrders, getPreOrderSettings, getPendingRefunds } from "@/lib/actions/pre-order";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { listActiveServices } from "@/lib/actions/services";
import { createClient } from "@/lib/supabase/server";
import PreOrdersClient from "./pre-orders-client";

export const dynamic = "force-dynamic";

export default async function PreOrdersPage() {
    await gatePermission("pre_order.view");
    const [list, settings, services, me, refunds] = await Promise.all([
        getPreOrders(),
        getPreOrderSettings(),
        listActiveServices(),
        getEffectivePermissionsForUser(),
        getPendingRefunds(),
    ]);
    const svc = (services || []).map((s) => ({ id: s.id, name: s.service_name, price: Number(s.selling_price || 0) }));
    // แพทย์ที่เลือกได้ตอนนัดวันทำ
    const supabase = await createClient();
    const { data: docRows } = await supabase.from("staff").select("id, profiles!inner(full_name, role)").eq("is_active", true).in("profiles.role", ["doctor", "dentist", "owner"]);
    const { data: tn } = me.clinicId ? await supabase.from("tenants").select("clinic_code").eq("id", me.clinicId).maybeSingle() : { data: null };
    const registerUrl = (tn?.clinic_code as string) || null;   // client ต่อเป็น origin/register/{code}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doctors = (docRows || []).map((d: any) => { const p = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles; return { id: d.id as string, name: (p?.full_name as string) || "—" }; });
    return (
        <PreOrdersClient
            initial={list}
            settings={settings}
            refunds={refunds}
            services={svc}
            doctors={doctors}
            registerUrl={registerUrl}
            canManage={!!me.permissions["pre_order.manage"]}
            canDecide={!!me.permissions["pre_order.decide"]}
            canExtend={!!me.permissions["pre_order.extend"]}
            canSettings={!!me.permissions["pre_order.settings"]}
            canRefund={!!me.permissions["finance.refund"]}
        />
    );
}
