import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { bangkokDate } from "@/lib/utils/date";
import PharmacyClient from "./pharmacy-client";

export const dynamic = "force-dynamic";

export default async function PharmacyPage() {
    await gatePermission("pharmacy.view");
    const supabase = await createClient();
    const today = bangkokDate();

    // คำนวณวันที่ 2 วันที่แล้ว (รองรับ visit ค้างข้ามวัน)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const fromDate = bangkokDate(twoDaysAgo);

    // Fetch visits waiting for meds or payment
    const { data: visits } = await supabase
        .from("visits")
        .select(`
            vn, hn, visit_date, visit_time, status, chief_complaint, created_at,
            patients!inner(prefix, first_name, last_name, phone),
            queue_entries(queue_number)
        `)
        .gte("visit_date", fromDate)
        .in("status", ["waiting_medicine", "waiting_payment"])
        .order("created_at", { ascending: true });

    return <PharmacyClient visits={visits || []} today={today} />;
}
