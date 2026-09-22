import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { bangkokDate } from "@/lib/utils/date";
import PharmacyClient from "./pharmacy-client";

export const dynamic = "force-dynamic";

export default async function PharmacyPage() {
    await gatePermission("pharmacy.view");
    const supabase = await createClient();
    const today = bangkokDate();

    // คิวรอจ่ายยา/รอชำระ — โชว์ทุกเคสที่ยังค้าง ไม่จำกัดวัน (ค้างข้ามหลายวันต้องไม่หาย)
    const { data: visits } = await supabase
        .from("visits")
        .select(`
            vn, hn, visit_date, visit_time, status, chief_complaint, created_at,
            patients!inner(prefix, first_name, last_name, phone),
            queue_entries(queue_number)
        `)
        .in("status", ["waiting_medicine", "waiting_payment"])
        .order("created_at", { ascending: true });

    return <PharmacyClient visits={visits || []} today={today} />;
}
