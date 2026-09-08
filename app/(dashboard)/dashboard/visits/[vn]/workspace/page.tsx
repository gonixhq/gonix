import { notFound } from "next/navigation";
import { gatePermission } from "@/lib/auth/guard";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getLabCatalog, getVisitLabOrders } from "@/lib/actions/lab-orders";
import { listAnonPanels } from "@/lib/actions/anonymous";
import type { ChartSheet } from "@/lib/visit-workspace-types";
import Workspace from "./workspace-client";

export default async function WorkspacePage({ params }: { params: Promise<{ vn: string }> }) {
    await gatePermission("visits.edit");
    const { clinicId } = await getEffectivePermissionsForUser();
    const { vn } = await params;
    const db = await createClient();
    const { data: visit, error } = await db.from("visits").select("*").eq("clinic_id", clinicId!).eq("vn", vn).single();
    if (error || !visit || visit.service_category !== "aesthetic") notFound();
    const { data: patient } = await db.from("patients").select("*,patient_allergies(allergen_name,is_active),patient_chronic_diseases(disease_name)").eq("clinic_id", clinicId!).eq("hn", visit.hn).single();
    if (!patient) notFound();
    const [vitals, drugs, past, catalog, orders, panels] = await Promise.all([
        db.from("vital_signs").select("*").eq("vn", vn).order("recorded_at", { ascending: false }).limit(1),
        db.from("drug_orders").select("*,inventory(item_name)").eq("clinic_id", clinicId!).eq("vn", vn),
        db.from("visits").select("vn,visit_date,service_category,chief_complaint,aesthetic_records,soap_o,soap_p,diagnosis_text,lab_orders(lab_name,status,result_value,result_unit,normal_range,result_flag)").eq("clinic_id", clinicId!).eq("hn", visit.hn).neq("vn", vn).order("visit_date", { ascending: false }).limit(20),
        getLabCatalog(), getVisitLabOrders(vn), listAnonPanels(),
    ]);
    if (vitals.error || drugs.error || past.error) throw Error("โหลดข้อมูลการตรวจไม่สำเร็จ กรุณาลองใหม่");
    const savedSheets: ChartSheet[] = visit.aesthetic_records?.workspace_sheets || [];
    const sheets = await Promise.all(savedSheets.map(async sheet => {
        if (!sheet.storagePath) return sheet;
        if (!sheet.storagePath.startsWith(`${clinicId}/visits/${vn}/workspace/`)) throw Error("ตำแหน่งภาพไม่ถูกต้อง");
        const { data, error } = await db.storage.from("clinic-assets").createSignedUrl(sheet.storagePath, 3600);
        if (error || !data) throw Error("เปิดภาพแผ่นวาดไม่สำเร็จ กรุณาลองใหม่");
        return { ...sheet, background: data.signedUrl };
    }));
    return <Workspace key={vn} visit={visit} patient={patient} vitals={vitals.data?.[0]} drugs={drugs.data || []} history={past.data || []} catalog={catalog} orders={orders} panels={panels} initialSheets={sheets} clinicId={clinicId!} />;
}
