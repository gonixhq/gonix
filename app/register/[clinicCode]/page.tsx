import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import RegisterForm from "./register-form";

export const dynamic = "force-dynamic";

export default async function PublicRegisterPage({
    params,
}: {
    params: Promise<{ clinicCode: string }>;
}) {
    const { clinicCode } = await params;
    const supabase = await createClient();

    // tenants ไม่มี phone/address — ดึงจาก branches แทน (main branch)
    const { data: tenant } = await supabase
        .from("tenants")
        .select("id, clinic_name, clinic_name_en")
        .eq("clinic_code", clinicCode.toUpperCase())
        .maybeSingle();

    if (!tenant) notFound();

    // ดึง main branch (ไม่บังคับว่าต้องมี — ใช้ของแรกที่เจอ)
    const { data: branch } = await supabase
        .from("branches")
        .select("address, phone")
        .eq("clinic_id", tenant.id)
        .eq("is_active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle();

    return <RegisterForm clinic={{
        ...tenant,
        phone: branch?.phone || null,
        address_detail: branch?.address || null,
    }} />;
}
