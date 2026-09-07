import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import LabClient from "./lab-client";

export default async function LabPage() {
    await gatePermission("lab.view");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");
    const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("clinic_id").eq("id", user.id).single();
    if (profileError || !profile?.clinic_id) throw new Error("ไม่พบข้อมูลคลินิกของผู้ใช้งาน");

    const { data, error } = await supabase
        .from("lab_orders")
        .select(`
            id, vn, hn, lab_name, created_at, status, result_note,
            patients!inner(hn, first_name, last_name)
        `)
        .eq("clinic_id", profile.clinic_id)
        .or("lab_type.is.null,lab_type.neq.package")
        .order("created_at", { ascending: false })
        .limit(100);

    // อย่าแสดงเป็นคิวว่างเมื่อ query ล้มเหลว
    if (error) throw new Error("โหลดรายการ Lab ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    const labOrders = (data || []).map((order) => ({
        ...order,
        patient: Array.isArray(order.patients) ? order.patients[0] : order.patients,
    }));

    return (
        <LabClient
            labOrders={labOrders}
            pending={labOrders.filter((order) => order.status === "ordered").length}
            inProgress={labOrders.filter((order) => order.status === "in_progress").length}
            completed={labOrders.filter((order) => order.status === "resulted").length}
        />
    );
}
