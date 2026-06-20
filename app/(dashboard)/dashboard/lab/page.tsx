import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import LabClient from "./lab-client";

export default async function LabPage() {
    await gatePermission("lab.view");
    const supabase = await createClient();

    const { data: labOrders } = await supabase
        .from("lab_orders")
        .select(`
            id, order_date, status, note,
            visits!inner(vn, visit_date),
            patients!inner(hn, first_name, last_name)
        `)
        .order("order_date", { ascending: false })
        .limit(100);

    // Stats
    const pending = (labOrders || []).filter((l: any) => l.status === "pending").length;
    const inProgress = (labOrders || []).filter((l: any) => l.status === "in_progress").length;
    const completed = (labOrders || []).filter((l: any) => l.status === "completed").length;

    return (
        <LabClient
            labOrders={labOrders || []}
            pending={pending}
            inProgress={inProgress}
            completed={completed}
        />
    );
}
