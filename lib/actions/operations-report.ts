"use server";

import { createClient } from "@/lib/supabase/server";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string };
}

export interface PeakHours {
    grid: number[][];       // [weekday 0=อา..6=ส][hour 0..23] = จำนวน visit
    maxCell: number;        // ค่าสูงสุดในตาราง (สำหรับ normalize สีความเข้ม)
    byHour: number[];       // รวมต่อชั่วโมง (0..23)
    byDay: number[];        // รวมต่อวัน (0..6)
    total: number;
    busiest: { day: number; hour: number; count: number } | null;
}

export interface StaffPerfRow {
    staff_id: string;
    name: string;
    role: string;
    cases: number;            // จำนวน visit ที่ดูแล
    patients: number;         // ลูกค้าไม่ซ้ำ
    sales: number;            // ยอดขาย (paid_amount ของบิลที่ผูกกับ visit ของคนนี้)
    avgPerCase: number;
    repeatRate: number;       // % ลูกค้าที่กลับมา ≥2 ครั้งกับคนนี้ (retention)
}

const PERF_EXCLUDE = new Set(["voided", "refunded", "draft"]);

/** ตารางผลงานแพทย์/พนักงาน — เคส + ยอดขาย + retention (ในช่วงวันที่) */
export async function getStaffPerformance(startDate: string, endDate: string): Promise<StaffPerfRow[]> {
    try {
        const { supabase, clinicId } = await getCtx();

        // visits ในช่วง (ที่มีผู้ดูแล)
        const { data: visits } = await supabase
            .from("visits")
            .select("vn, hn, doctor_id")
            .eq("clinic_id", clinicId)
            .gte("visit_date", startDate).lte("visit_date", endDate)
            .not("doctor_id", "is", null);
        const visitList = visits || [];
        if (visitList.length === 0) return [];

        // map vn → doctor_id
        const docByVn: Record<string, string> = {};
        const casesByDoc: Record<string, number> = {};
        const patientsByDoc: Record<string, Set<string>> = {};
        const visitsByDocHn: Record<string, Record<string, number>> = {}; // doc → hn → จำนวนครั้ง
        for (const v of visitList) {
            const doc = v.doctor_id as string;
            const vn = v.vn as string;
            const hn = v.hn as string;
            docByVn[vn] = doc;
            casesByDoc[doc] = (casesByDoc[doc] || 0) + 1;
            (patientsByDoc[doc] = patientsByDoc[doc] || new Set()).add(hn);
            const m = (visitsByDocHn[doc] = visitsByDocHn[doc] || {});
            m[hn] = (m[hn] || 0) + 1;
        }

        // ยอดขาย: บิลในช่วง ผูกผ่าน vn → doctor
        const { data: invoices } = await supabase
            .from("invoice_headers")
            .select("vn, paid_amount, total_amount, status")
            .eq("clinic_id", clinicId)
            .gte("invoice_date", startDate).lte("invoice_date", endDate);
        const salesByDoc: Record<string, number> = {};
        for (const inv of invoices || []) {
            if (PERF_EXCLUDE.has(inv.status as string)) continue;
            const doc = docByVn[inv.vn as string];
            if (!doc) continue;
            salesByDoc[doc] = (salesByDoc[doc] || 0) + Number(inv.paid_amount ?? inv.total_amount ?? 0);
        }

        // ชื่อ + role จาก staff → profiles
        const docIds = Object.keys(casesByDoc);
        const nameById: Record<string, { name: string; role: string }> = {};
        const { data: staff } = await supabase
            .from("staff").select("id, profiles(full_name, role)").in("id", docIds);
        (staff || []).forEach(s => {
            const rel = s.profiles as unknown as { full_name?: string; role?: string } | { full_name?: string; role?: string }[] | null;
            const p = Array.isArray(rel) ? rel[0] : rel;
            nameById[s.id as string] = { name: p?.full_name || "—", role: p?.role || "staff" };
        });

        const rows: StaffPerfRow[] = docIds.map(doc => {
            const cases = casesByDoc[doc] || 0;
            const patients = patientsByDoc[doc]?.size || 0;
            const sales = Math.round((salesByDoc[doc] || 0) * 100) / 100;
            const repeatPatients = Object.values(visitsByDocHn[doc] || {}).filter(c => c >= 2).length;
            return {
                staff_id: doc,
                name: nameById[doc]?.name || "—",
                role: nameById[doc]?.role || "staff",
                cases, patients, sales,
                avgPerCase: cases > 0 ? Math.round((sales / cases) * 100) / 100 : 0,
                repeatRate: patients > 0 ? Math.round((repeatPatients / patients) * 1000) / 10 : 0,
            };
        }).sort((a, b) => b.sales - a.sales);

        return rows;
    } catch {
        return [];
    }
}

/** Heatmap จำนวน visit แยกตามวันในสัปดาห์ × ชั่วโมงของวัน (ในช่วงวันที่) */
export async function getPeakHours(startDate: string, endDate: string): Promise<PeakHours> {
    const empty: PeakHours = { grid: Array.from({ length: 7 }, () => new Array(24).fill(0)), maxCell: 0, byHour: new Array(24).fill(0), byDay: new Array(7).fill(0), total: 0, busiest: null };
    try {
        const { supabase, clinicId } = await getCtx();
        const { data: visits } = await supabase
            .from("visits")
            .select("visit_date, visit_time")
            .eq("clinic_id", clinicId)
            .gte("visit_date", startDate)
            .lte("visit_date", endDate);

        const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
        const byHour = new Array(24).fill(0);
        const byDay = new Array(7).fill(0);
        let total = 0, maxCell = 0;
        let busiest: { day: number; hour: number; count: number } | null = null;

        for (const v of visits || []) {
            const date = v.visit_date as string;
            const time = (v.visit_time as string) || "";
            if (!date) continue;
            const day = new Date(date + "T00:00:00+07:00").getDay();  // 0=อา..6=ส
            const hour = parseInt(time.slice(0, 2), 10);
            if (isNaN(day) || isNaN(hour) || hour < 0 || hour > 23) continue;
            grid[day][hour]++;
            byHour[hour]++;
            byDay[day]++;
            total++;
            if (grid[day][hour] > maxCell) maxCell = grid[day][hour];
            if (!busiest || grid[day][hour] > busiest.count) busiest = { day, hour, count: grid[day][hour] };
        }
        return { grid, maxCell, byHour, byDay, total, busiest };
    } catch {
        return empty;
    }
}
