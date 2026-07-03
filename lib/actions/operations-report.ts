"use server";

import { createClient } from "@/lib/supabase/server";
import type { Seg } from "@/lib/report-segment";

function catKeep(seg: Seg, cat: string | null | undefined): boolean {
    if (seg === "all") return true;
    const isAes = cat === "aesthetic";
    return seg === "aesthetic" ? isAes : !isAes;
}

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string };
}

export interface OutstandingPackageItem {
    hn: string;
    patient_name: string;
    package_name: string;
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    paid_amount: number;
    unearned: number;        // ภาระผูกพันคงเหลือ = paid × remaining/total
    expires_at: string;
}
export interface OutstandingPackages {
    count: number;
    totalRemainingSessions: number;
    totalLiability: number;  // มูลค่าที่จ่ายแล้วแต่ยังไม่ได้ให้บริการ (deferred)
    items: OutstandingPackageItem[];
}

/** คอสที่จ่ายแล้วแต่ยังใช้ไม่ครบ (Liabilities / ภาระผูกพันล่วงหน้า) — สถานะปัจจุบัน */
export async function getOutstandingPackages(): Promise<OutstandingPackages> {
    const empty: OutstandingPackages = { count: 0, totalRemainingSessions: 0, totalLiability: 0, items: [] };
    try {
        const { supabase, clinicId } = await getCtx();
        const { data: pkgs } = await supabase
            .from("patient_packages")
            .select("hn, package_name, total_sessions, used_sessions, paid_amount, expires_at, status")
            .eq("clinic_id", clinicId)
            .eq("status", "active");
        const list = (pkgs || []).filter(p => Number(p.used_sessions) < Number(p.total_sessions));
        if (list.length === 0) return empty;

        const hns = [...new Set(list.map(p => p.hn as string))];
        const nameByHn: Record<string, string> = {};
        if (hns.length) {
            const { data: pats } = await supabase.from("patients").select("hn, first_name, last_name").in("hn", hns).eq("clinic_id", clinicId);
            (pats || []).forEach(p => { nameByHn[p.hn as string] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || (p.hn as string); });
        }

        let totalRemainingSessions = 0, totalLiability = 0;
        const items: OutstandingPackageItem[] = list.map(p => {
            const total = Number(p.total_sessions) || 0;
            const used = Number(p.used_sessions) || 0;
            const remaining = Math.max(0, total - used);
            const paid = Number(p.paid_amount) || 0;
            const unearned = total > 0 ? Math.round((paid * remaining / total) * 100) / 100 : 0;
            totalRemainingSessions += remaining;
            totalLiability += unearned;
            return {
                hn: p.hn as string,
                patient_name: nameByHn[p.hn as string] || (p.hn as string),
                package_name: p.package_name as string,
                total_sessions: total, used_sessions: used, remaining_sessions: remaining,
                paid_amount: paid, unearned, expires_at: p.expires_at as string,
            };
        }).sort((a, b) => b.unearned - a.unearned);

        return { count: items.length, totalRemainingSessions, totalLiability: Math.round(totalLiability * 100) / 100, items };
    } catch {
        return empty;
    }
}

export interface MarginRow {
    type: string;
    revenue: number;
    cogs: number;          // ต้นทุน (cogs_amount snapshot)
    margin: number;        // กำไรขั้นต้น = revenue − cogs
    marginPct: number;
    count: number;
}
export interface MarginItem {
    name: string; type: string; qty: number; revenue: number; cogs: number; margin: number;
}
export interface InventoryRevenue {
    byType: MarginRow[];
    items: MarginItem[];   // รายตัว (top ตาม revenue) สำหรับ export ละเอียด
    totals: { revenue: number; cogs: number; margin: number; marginPct: number };
}

/** Inventory-Revenue: กำไรขั้นต้นต่อประเภท (แยกต้นทุนยา/เวชภัณฑ์ vs ค่าบริการ) */
export async function getInventoryRevenue(startDate: string, endDate: string, seg: Seg = "all"): Promise<InventoryRevenue> {
    const empty: InventoryRevenue = { byType: [], items: [], totals: { revenue: 0, cogs: 0, margin: 0, marginPct: 0 } };
    try {
        const { supabase, clinicId } = await getCtx();
        // Business Unit filter: map vn → aesthetic?
        const aesByVn: Record<string, boolean> = {};
        if (seg !== "all") {
            const { data: sv } = await supabase.from("visits").select("vn, service_category")
                .eq("clinic_id", clinicId).gte("visit_date", startDate).lte("visit_date", endDate);
            (sv || []).forEach(v => { aesByVn[v.vn as string] = v.service_category === "aesthetic"; });
        }
        const keepVn = (vn: string | null | undefined) => {
            if (seg === "all") return true;
            const isAes = vn ? aesByVn[vn] : undefined;
            return seg === "aesthetic" ? isAes === true : isAes === false;
        };
        const { data: rows } = await supabase
            .from("invoice_items")
            .select("item_type, item_name, qty, line_total, cogs_amount, invoice_headers!inner(invoice_date, status, vn)")
            .eq("clinic_id", clinicId)
            .gte("invoice_headers.invoice_date", startDate)
            .lte("invoice_headers.invoice_date", endDate);

        const byType = new Map<string, { revenue: number; cogs: number; count: number }>();
        const byItem = new Map<string, { type: string; qty: number; revenue: number; cogs: number }>();
        let tRev = 0, tCogs = 0;
        for (const it of rows || []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const h = Array.isArray((it as any).invoice_headers) ? (it as any).invoice_headers[0] : (it as any).invoice_headers;
            if (h && PERF_EXCLUDE.has(h.status)) continue;
            if (h && !keepVn(h.vn)) continue;
            const type = (it.item_type as string) || "other";
            const rev = Number(it.line_total || 0);
            const cogs = Number(it.cogs_amount || 0);
            const qty = Number(it.qty || 0);
            const t = byType.get(type) || { revenue: 0, cogs: 0, count: 0 };
            t.revenue += rev; t.cogs += cogs; t.count += 1; byType.set(type, t);
            const name = (it.item_name as string) || "—";
            const ii = byItem.get(name) || { type, qty: 0, revenue: 0, cogs: 0 };
            ii.qty += qty; ii.revenue += rev; ii.cogs += cogs; byItem.set(name, ii);
            tRev += rev; tCogs += cogs;
        }
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const byTypeArr: MarginRow[] = [...byType.entries()].map(([type, v]) => ({
            type, revenue: r2(v.revenue), cogs: r2(v.cogs), margin: r2(v.revenue - v.cogs),
            marginPct: v.revenue > 0 ? r2(((v.revenue - v.cogs) / v.revenue) * 100) : 0, count: v.count,
        })).sort((a, b) => b.revenue - a.revenue);
        const items: MarginItem[] = [...byItem.entries()].map(([name, v]) => ({
            name, type: v.type, qty: r2(v.qty), revenue: r2(v.revenue), cogs: r2(v.cogs), margin: r2(v.revenue - v.cogs),
        })).sort((a, b) => b.revenue - a.revenue).slice(0, 100);

        return {
            byType: byTypeArr, items,
            totals: { revenue: r2(tRev), cogs: r2(tCogs), margin: r2(tRev - tCogs), marginPct: tRev > 0 ? r2(((tRev - tCogs) / tRev) * 100) : 0 },
        };
    } catch {
        return empty;
    }
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
    shiftHours: number;       // ชั่วโมงเข้าเวรจริง (จาก GPS check-in / staff_time_logs)
    salesPerHour: number;     // ยอดขาย ÷ ชั่วโมงเวร (productivity จริง)
}

const PERF_EXCLUDE = new Set(["voided", "refunded", "draft"]);

/** ตารางผลงานแพทย์/พนักงาน — เคส + ยอดขาย + retention (ในช่วงวันที่) */
export async function getStaffPerformance(startDate: string, endDate: string, seg: Seg = "all"): Promise<StaffPerfRow[]> {
    try {
        const { supabase, clinicId } = await getCtx();

        // visits ในช่วง (ที่มีผู้ดูแล)
        const { data: visits } = await supabase
            .from("visits")
            .select("vn, hn, doctor_id, service_category")
            .eq("clinic_id", clinicId)
            .gte("visit_date", startDate).lte("visit_date", endDate)
            .not("doctor_id", "is", null);
        const visitList = (visits || []).filter(v => catKeep(seg, v.service_category as string));
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

        // ชั่วโมงเข้าเวรจริง (GPS check-in / staff_time_logs) ในช่วง
        const startISO = new Date(`${startDate}T00:00:00+07:00`).toISOString();
        const endNext = new Date(`${endDate}T00:00:00+07:00`); endNext.setDate(endNext.getDate() + 1);
        const endISO = endNext.toISOString();
        const hoursByDoc: Record<string, number> = {};
        const { data: logs } = await supabase
            .from("staff_time_logs")
            .select("staff_id, clock_in, clock_out")
            .in("staff_id", docIds)
            .gte("clock_in", startISO).lt("clock_in", endISO)
            .not("clock_out", "is", null);
        (logs || []).forEach(l => {
            const ms = new Date(l.clock_out as string).getTime() - new Date(l.clock_in as string).getTime();
            if (ms > 0) hoursByDoc[l.staff_id as string] = (hoursByDoc[l.staff_id as string] || 0) + ms / 3600000;
        });

        const rows: StaffPerfRow[] = docIds.map(doc => {
            const cases = casesByDoc[doc] || 0;
            const patients = patientsByDoc[doc]?.size || 0;
            const sales = Math.round((salesByDoc[doc] || 0) * 100) / 100;
            const repeatPatients = Object.values(visitsByDocHn[doc] || {}).filter(c => c >= 2).length;
            const shiftHours = Math.round((hoursByDoc[doc] || 0) * 10) / 10;
            return {
                staff_id: doc,
                name: nameById[doc]?.name || "—",
                role: nameById[doc]?.role || "staff",
                cases, patients, sales,
                avgPerCase: cases > 0 ? Math.round((sales / cases) * 100) / 100 : 0,
                repeatRate: patients > 0 ? Math.round((repeatPatients / patients) * 1000) / 10 : 0,
                shiftHours,
                salesPerHour: shiftHours > 0 ? Math.round((sales / shiftHours) * 100) / 100 : 0,
            };
        }).sort((a, b) => b.sales - a.sales);

        return rows;
    } catch {
        return [];
    }
}

/** Heatmap จำนวน visit แยกตามวันในสัปดาห์ × ชั่วโมงของวัน (ในช่วงวันที่) */
export async function getPeakHours(startDate: string, endDate: string, seg: Seg = "all"): Promise<PeakHours> {
    const empty: PeakHours = { grid: Array.from({ length: 7 }, () => new Array(24).fill(0)), maxCell: 0, byHour: new Array(24).fill(0), byDay: new Array(7).fill(0), total: 0, busiest: null };
    try {
        const { supabase, clinicId } = await getCtx();
        const { data: visitsRaw } = await supabase
            .from("visits")
            .select("visit_date, visit_time, service_category")
            .eq("clinic_id", clinicId)
            .gte("visit_date", startDate)
            .lte("visit_date", endDate);
        const visits = (visitsRaw || []).filter(v => catKeep(seg, v.service_category as string));

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
