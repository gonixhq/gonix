"use server";

import { createClient } from "@/lib/supabase/server";
import type { Seg } from "@/lib/report-segment";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string };
}

const EXCLUDE = new Set(["voided", "refunded", "draft"]);
function catKeep(seg: Seg, cat: string | null | undefined): boolean {
    if (seg === "all") return true;
    const isAes = cat === "aesthetic";
    return seg === "aesthetic" ? isAes : !isAes;
}

// ── M3 #2 Customer Acquisition Source ──────────────────
export interface AcqSource { source: string; label: string; count: number; pct: number; }

const SOURCE_LABEL: Record<string, string> = {
    walk_in: "Walk-in (เดินเข้ามาเอง)", line: "LINE", affiliate: "เซลล์แนะนำ",
    referral: "ลูกค้าแนะนำ", unknown: "ไม่ระบุ",
};

/** สัดส่วนที่มาของเคส (case_source) ในช่วง — สำหรับกราฟวงกลม */
export async function getAcquisitionSources(startDate: string, endDate: string, seg: Seg = "all"): Promise<AcqSource[]> {
    try {
        const { supabase, clinicId } = await getCtx();
        const { data } = await supabase.from("visits")
            .select("case_source, service_category").eq("clinic_id", clinicId)
            .gte("visit_date", startDate).lte("visit_date", endDate);
        const rows = (data || []).filter(v => catKeep(seg, v.service_category as string));
        const counts: Record<string, number> = {};
        rows.forEach(v => { const s = (v.case_source as string) || "unknown"; counts[s] = (counts[s] || 0) + 1; });
        const total = rows.length || 1;
        return Object.entries(counts)
            .map(([source, count]) => ({ source, label: SOURCE_LABEL[source] || source, count, pct: Math.round((count / total) * 1000) / 10 }))
            .sort((a, b) => b.count - a.count);
    } catch {
        return [];
    }
}

// ── M3 #4 Consultation → Sale Conversion ───────────────
export interface ConversionRow { staff_id: string; name: string; visits: number; closed: number; rate: number; }
export interface ConversionResult { totalVisits: number; closedVisits: number; rate: number; byDoctor: ConversionRow[]; }

/** อัตราปิดการขาย = visit ที่มีบิลจ่าย>0 ÷ visit ทั้งหมด (รวม + ต่อแพทย์) */
export async function getConsultationConversion(startDate: string, endDate: string, seg: Seg = "all"): Promise<ConversionResult> {
    const empty: ConversionResult = { totalVisits: 0, closedVisits: 0, rate: 0, byDoctor: [] };
    try {
        const { supabase, clinicId } = await getCtx();
        const { data: visits } = await supabase.from("visits")
            .select("vn, doctor_id, service_category").eq("clinic_id", clinicId)
            .gte("visit_date", startDate).lte("visit_date", endDate);
        const vList = (visits || []).filter(v => catKeep(seg, v.service_category as string));
        if (vList.length === 0) return empty;

        // บิลจ่าย>0 → vn ที่ปิดการขาย
        const { data: invs } = await supabase.from("invoice_headers")
            .select("vn, paid_amount, status").eq("clinic_id", clinicId)
            .gte("invoice_date", startDate).lte("invoice_date", endDate);
        const closedVns = new Set<string>();
        (invs || []).forEach(i => {
            if (!EXCLUDE.has(i.status as string) && Number(i.paid_amount || 0) > 0 && i.vn) closedVns.add(i.vn as string);
        });

        const byDoc: Record<string, { visits: number; closed: number }> = {};
        let closedVisits = 0;
        for (const v of vList) {
            const vn = v.vn as string;
            const isClosed = closedVns.has(vn);
            if (isClosed) closedVisits++;
            const doc = (v.doctor_id as string) || "none";
            const d = (byDoc[doc] = byDoc[doc] || { visits: 0, closed: 0 });
            d.visits++; if (isClosed) d.closed++;
        }

        // ชื่อแพทย์
        const docIds = Object.keys(byDoc).filter(d => d !== "none");
        const nameById: Record<string, string> = {};
        if (docIds.length) {
            const { data: staff } = await supabase.from("staff").select("id, profiles(full_name)").in("id", docIds);
            (staff || []).forEach(s => {
                const rel = s.profiles as unknown as { full_name?: string } | { full_name?: string }[] | null;
                const p = Array.isArray(rel) ? rel[0] : rel;
                nameById[s.id as string] = p?.full_name || "—";
            });
        }
        const byDoctor: ConversionRow[] = Object.entries(byDoc).map(([doc, v]) => ({
            staff_id: doc, name: doc === "none" ? "ไม่ระบุแพทย์" : (nameById[doc] || "—"),
            visits: v.visits, closed: v.closed, rate: v.visits > 0 ? Math.round((v.closed / v.visits) * 1000) / 10 : 0,
        })).sort((a, b) => b.visits - a.visits);

        return {
            totalVisits: vList.length, closedVisits,
            rate: Math.round((closedVisits / vList.length) * 1000) / 10, byDoctor,
        };
    } catch {
        return empty;
    }
}

// ── M3 #5 Demographic (อายุ + เพศ) ─────────────────────
export interface Demographics {
    total: number;
    gender: { key: string; label: string; count: number; pct: number }[];
    ageBuckets: { label: string; count: number; pct: number }[];
    withDob: number;
}
const GENDER_LABEL: Record<string, string> = { M: "ชาย", F: "หญิง", other: "อื่นๆ", unknown: "ไม่ระบุ" };
const AGE_BUCKETS: [string, number, number][] = [["0-17", 0, 17], ["18-25", 18, 25], ["26-35", 26, 35], ["36-45", 36, 45], ["46-60", 46, 60], ["60+", 61, 200]];

/** สถิติประชากรลูกค้า (อายุ/เพศ) — ทั้งคลินิก */
export async function getDemographics(): Promise<Demographics> {
    const empty: Demographics = { total: 0, gender: [], ageBuckets: [], withDob: 0 };
    try {
        const { supabase, clinicId } = await getCtx();
        const { data } = await supabase.from("patients").select("dob, gender").eq("clinic_id", clinicId);
        const rows = data || [];
        const total = rows.length;
        if (total === 0) return empty;

        const gCount: Record<string, number> = {};
        const bCount: Record<string, number> = {};
        let withDob = 0;
        const now = new Date();
        for (const p of rows) {
            const g = (p.gender as string) || "unknown";
            gCount[g] = (gCount[g] || 0) + 1;
            if (p.dob) {
                const age = Math.floor((now.getTime() - new Date(p.dob as string + "T00:00:00").getTime()) / (365.25 * 86400000));
                if (age >= 0 && age < 200) {
                    withDob++;
                    const bucket = AGE_BUCKETS.find(([, lo, hi]) => age >= lo && age <= hi);
                    if (bucket) bCount[bucket[0]] = (bCount[bucket[0]] || 0) + 1;
                }
            }
        }
        return {
            total, withDob,
            gender: Object.entries(gCount).map(([key, count]) => ({ key, label: GENDER_LABEL[key] || key, count, pct: Math.round((count / total) * 1000) / 10 })).sort((a, b) => b.count - a.count),
            ageBuckets: AGE_BUCKETS.map(([label]) => ({ label, count: bCount[label] || 0, pct: withDob > 0 ? Math.round(((bCount[label] || 0) / withDob) * 1000) / 10 : 0 })),
        };
    } catch {
        return empty;
    }
}
