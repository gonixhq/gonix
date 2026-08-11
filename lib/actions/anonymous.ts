"use server";

import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";
import { genVerifyCode } from "@/lib/utils/anon-code";
import { isDayClosed, DAY_LOCKED_MSG } from "@/lib/eod-lock";
import { deductFEFO, restoreFEFO } from "@/lib/inventory-fefo";
import { revalidatePath } from "next/cache";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles")
        .select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string, userId: user.id };
}

// ── Types ───────────────────────────────────────────
export interface LabService { id: string; name: string; price: number; item_type: string; }

export interface AnonTest {
    id: string;
    service_id: string | null;
    test_name: string;
    item_type: string;       // lab/lab_external = มีผล, อื่นๆ = ค่าบริการ
    price: number;
    result_value: string | null;
    result_status: string;   // pending / negative / positive / inconclusive
    result_note: string | null;
    resulted_at: string | null;
}

export interface AnonCaseRow {
    id: string;
    code: string;             // verify_code (หรือ case_code เดิม)
    reg_channel: string;
    case_date: string;
    sex: string | null;
    age: number | null;
    status: string;
    total_amount: number;
    paid: boolean;
    test_count: number;
    positive_count: number;
    pending_count: number;
    followup_requested: boolean;
}

export interface AnonCaseFull {
    id: string;
    case_code: string;
    case_date: string;
    sex: string | null;
    age: number | null;
    risk_note: string | null;
    pre_counsel_done: boolean;
    pre_counsel_note: string | null;
    pre_counsel_at: string | null;
    post_counsel_done: boolean;
    post_counsel_note: string | null;
    post_counsel_at: string | null;
    result_appt_date: string | null;
    total_amount: number;
    paid: boolean;
    payment_method: string | null;
    paid_at: string | null;
    receipt_no: string | null;
    status: string;
    note: string | null;
    // online registration
    verify_code: string | null;
    reg_channel: string;
    code_expires_at: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    questionnaire: Record<string, unknown> | null;
    vitals: Record<string, unknown> | null;
    followup_requested: boolean;
    followup_at: string | null;
    tests: AnonTest[];
}

export interface AnonStats {
    pendingOnline: number;   // ลงทะเบียนออนไลน์ ยังไม่เปิดเคส (รอแจ้งรหัส)
    awaitingResult: number;  // เปิดเคสแล้ว ยังไม่มีผล
    positiveOpen: number;
    unpaid: number;
    followupPending: number; // ผู้รับบริการขอนัดหมายพบแพทย์ (ยังไม่ปิดเคส)
}

const num = (n: unknown) => Number(n || 0);

// ชนิดที่ถือเป็น "รายการตรวจ Lab" (มีผล) — นอกนั้นเป็นค่าบริการ
const LAB_TYPES = new Set(["lab", "lab_external"]);
const isLab = (t?: string | null) => LAB_TYPES.has((t as string) || "");

// ── Stats ───────────────────────────────────────────
export async function getAnonStats(): Promise<AnonStats> {
    const { supabase, clinicId } = await getCtx();
    const { data } = await supabase
        .from("anon_cases")
        .select("id, case_date, status, paid, reg_channel, followup_requested")
        .eq("clinic_id", clinicId);
    const rows = data || [];

    // positive open = เคสที่มีผล positive แต่ยังไม่ปิด
    const { data: posTests } = await supabase
        .from("anon_case_tests")
        .select("case_id, result_status, anon_cases!inner(clinic_id, status)")
        .eq("result_status", "positive")
        .eq("anon_cases.clinic_id", clinicId);
    const posOpen = new Set(
        (posTests || [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((t: any) => {
                const h = Array.isArray(t.anon_cases) ? t.anon_cases[0] : t.anon_cases;
                return h && h.status !== "closed";
            })
            .map((t) => t.case_id as string)
    );

    return {
        pendingOnline: rows.filter((r) => r.status === "registered" && r.reg_channel === "online").length,
        awaitingResult: rows.filter((r) => r.status === "opened" || r.status === "collected").length,
        positiveOpen: posOpen.size,
        unpaid: rows.filter((r) => r.paid === false && r.status !== "closed" && r.status !== "registered").length,
        followupPending: rows.filter((r) => r.followup_requested === true && r.status !== "closed").length,
    };
}

// ── รายรับนิรนาม (รวมเข้าระบบการเงิน/EOD/รายงาน) ──────
const round2 = (n: number) => Math.round(n * 100) / 100;
export interface AnonRevenue {
    total: number;
    byDay: { date: string; amount: number }[];
    byMethod: { method: string; amount: number; count: number }[];
    byType: { type: string; amount: number; count: number }[];
    topItems: { name: string; type: string; qty: number; amount: number }[];
}
/** ยอดรับนิรนามที่ชำระแล้ว ในช่วงวันที่ (อ้างอิง paid_at เวลาไทย) */
export async function getAnonRevenue(startDate: string, endDate: string): Promise<AnonRevenue> {
    const { supabase, clinicId } = await getCtx();
    const startISO = new Date(`${startDate}T00:00:00+07:00`).toISOString();
    const endNext = new Date(`${endDate}T00:00:00+07:00`); endNext.setDate(endNext.getDate() + 1);
    const endISO = endNext.toISOString();

    const { data: cases } = await supabase.from("anon_cases")
        .select("id, total_amount, payment_method, paid_at")
        .eq("clinic_id", clinicId).eq("paid", true)
        .gte("paid_at", startISO).lt("paid_at", endISO);
    const list = cases || [];

    let total = 0;
    const byDayMap: Record<string, number> = {};
    const byMethodMap: Record<string, { amount: number; count: number }> = {};
    for (const c of list) {
        const amt = num(c.total_amount);
        total += amt;
        const day = bangkokDate(new Date(c.paid_at as string));
        byDayMap[day] = (byDayMap[day] || 0) + amt;
        const m = (c.payment_method as string) || "cash";
        if (!byMethodMap[m]) byMethodMap[m] = { amount: 0, count: 0 };
        byMethodMap[m].amount += amt; byMethodMap[m].count += 1;
    }

    const ids = list.map((c) => c.id as string);
    const byTypeMap: Record<string, { amount: number; count: number }> = {};
    const itemMap: Record<string, { qty: number; amount: number; type: string }> = {};
    if (ids.length > 0) {
        const { data: tests } = await supabase.from("anon_case_tests").select("test_name, item_type, price").in("case_id", ids);
        for (const t of tests || []) {
            const amt = num(t.price); const type = (t.item_type as string) || "other";
            if (!byTypeMap[type]) byTypeMap[type] = { amount: 0, count: 0 };
            byTypeMap[type].amount += amt; byTypeMap[type].count += 1;
            const name = (t.test_name as string) || "—";
            if (!itemMap[name]) itemMap[name] = { qty: 0, amount: 0, type };
            itemMap[name].qty += 1; itemMap[name].amount += amt;
        }
    }

    return {
        total: round2(total),
        byDay: Object.entries(byDayMap).map(([date, amount]) => ({ date, amount: round2(amount) })),
        byMethod: Object.entries(byMethodMap).map(([method, v]) => ({ method, amount: round2(v.amount), count: v.count })),
        byType: Object.entries(byTypeMap).map(([type, v]) => ({ type, amount: round2(v.amount), count: v.count })),
        topItems: Object.entries(itemMap).map(([name, v]) => ({ name, type: v.type, qty: v.qty, amount: round2(v.amount) })),
    };
}

// ── List ────────────────────────────────────────────
export async function getAnonCases(search?: string): Promise<AnonCaseRow[]> {
    const { supabase, clinicId } = await getCtx();
    // แสดงเฉพาะเคสที่ "เปิดแล้ว" — เคสลงทะเบียนออนไลน์ที่ยังไม่เปิด (registered) จะถูกซ่อน
    // เจ้าหน้าที่ต้องป้อนรหัสยืนยันเพื่อเปิดเคสก่อนถึงเห็นข้อมูล
    let q = supabase
        .from("anon_cases")
        .select("id, case_code, verify_code, reg_channel, case_date, sex, age, status, total_amount, paid, followup_requested, anon_case_tests(result_status, item_type)")
        .eq("clinic_id", clinicId)
        .neq("status", "registered")
        .order("case_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
    if (search && search.trim()) {
        const s = search.trim();
        q = q.or(`verify_code.ilike.%${s}%,case_code.ilike.%${s}%`);
    }

    const { data } = await q;
    return (data || []).map((c) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tests: any[] = c.anon_case_tests || [];
        return {
            id: c.id as string,
            code: (c.verify_code as string) || (c.case_code as string) || "—",
            reg_channel: (c.reg_channel as string) || "walkin",
            case_date: c.case_date as string,
            sex: c.sex as string | null,
            age: c.age as number | null,
            status: c.status as string,
            total_amount: num(c.total_amount),
            paid: !!c.paid,
            test_count: tests.filter((t) => isLab(t.item_type)).length,
            positive_count: tests.filter((t) => t.result_status === "positive").length,
            pending_count: tests.filter((t) => isLab(t.item_type) && t.result_status === "pending").length,
            followup_requested: !!c.followup_requested,
        };
    });
}

// ── Single case ─────────────────────────────────────
export async function getAnonCase(id: string): Promise<AnonCaseFull | null> {
    const { supabase, clinicId } = await getCtx();
    const { data: c } = await supabase
        .from("anon_cases")
        .select("*")
        .eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    if (!c) return null;

    const { data: tests } = await supabase
        .from("anon_case_tests")
        .select("id, service_id, test_name, item_type, price, result_value, result_status, result_note, resulted_at")
        .eq("case_id", id)
        .order("created_at", { ascending: true });

    return {
        id: c.id, case_code: c.case_code, case_date: c.case_date,
        sex: c.sex, age: c.age, risk_note: c.risk_note,
        pre_counsel_done: !!c.pre_counsel_done, pre_counsel_note: c.pre_counsel_note, pre_counsel_at: c.pre_counsel_at,
        post_counsel_done: !!c.post_counsel_done, post_counsel_note: c.post_counsel_note, post_counsel_at: c.post_counsel_at,
        result_appt_date: c.result_appt_date,
        total_amount: num(c.total_amount), paid: !!c.paid, payment_method: c.payment_method,
        paid_at: c.paid_at, receipt_no: c.receipt_no,
        status: c.status, note: c.note,
        verify_code: c.verify_code ?? null, reg_channel: (c.reg_channel as string) || "walkin",
        code_expires_at: c.code_expires_at ?? null,
        contact_email: c.contact_email ?? null, contact_phone: c.contact_phone ?? null,
        questionnaire: (c.questionnaire as Record<string, unknown> | null) ?? null,
        vitals: (c.vitals as Record<string, unknown> | null) ?? null,
        followup_requested: !!c.followup_requested, followup_at: c.followup_at ?? null,
        tests: (tests || []).map((t) => ({
            id: t.id, service_id: t.service_id, test_name: t.test_name,
            item_type: (t.item_type as string) || "other", price: num(t.price),
            result_value: t.result_value, result_status: t.result_status || "pending",
            result_note: t.result_note, resulted_at: t.resulted_at,
        })),
    };
}

// ── Services for test picker (เลือกได้เอง) ──────────
export async function getLabServices(): Promise<LabService[]> {
    const { supabase, clinicId } = await getCtx();
    const { data } = await supabase
        .from("service_catalog")
        .select("id, service_name, selling_price, item_type")
        .eq("clinic_id", clinicId).eq("is_active", true)
        .order("item_type", { ascending: true })
        .order("service_name", { ascending: true });
    return (data || []).map((s) => ({
        id: s.id as string, name: s.service_name as string,
        price: num(s.selling_price), item_type: (s.item_type as string) || "other",
    }));
}

// ── Lab panels (แพ็กเกจ) ────────────────────────────
export interface AnonPanelItem { service_id: string; name: string; item_type: string; price: number; }
export interface AnonPanel {
    id: string; name: string; note: string | null;
    price: number; cost: number; result_days: number;
    is_active: boolean; sort_order: number;
    items: AnonPanelItem[];
}

export async function listAnonPanels(): Promise<AnonPanel[]> {
    const { supabase, clinicId } = await getCtx();
    const { data: panels } = await supabase.from("anon_panels")
        .select("id, name, note, price, cost, result_days, is_active, sort_order")
        .eq("clinic_id", clinicId)
        .order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (!panels?.length) return [];
    const ids = panels.map((p) => p.id as string);
    const { data: items } = await supabase.from("anon_panel_items")
        .select("panel_id, service_id, service_catalog(service_name, item_type, selling_price)")
        .in("panel_id", ids);
    const byPanel = new Map<string, AnonPanelItem[]>();
    for (const it of items || []) {
        const sc: any = Array.isArray(it.service_catalog) ? it.service_catalog[0] : it.service_catalog;
        const arr = byPanel.get(it.panel_id as string) || [];
        arr.push({
            service_id: it.service_id as string, name: sc?.service_name || "—",
            item_type: sc?.item_type || "other", price: num(sc?.selling_price),
        });
        byPanel.set(it.panel_id as string, arr);
    }
    return panels.map((p) => ({
        id: p.id as string, name: p.name as string, note: (p.note as string) || null,
        price: num(p.price), cost: num(p.cost), result_days: Number(p.result_days || 1),
        is_active: p.is_active !== false, sort_order: Number(p.sort_order || 0),
        items: byPanel.get(p.id as string) || [],
    }));
}

export async function createAnonPanel(input: {
    name: string; note?: string; price: number; cost?: number; result_days?: number; serviceIds: string[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const { supabase, clinicId } = await getCtx();
    if (!input.name?.trim()) return { ok: false, error: "กรุณาใส่ชื่อแพ็กเกจ" };
    if (!input.serviceIds?.length) return { ok: false, error: "กรุณาเลือกเทสย่อยอย่างน้อย 1 รายการ" };
    const { data: panel, error } = await supabase.from("anon_panels").insert({
        clinic_id: clinicId, name: input.name.trim(), note: input.note?.trim() || null,
        price: num(input.price), cost: num(input.cost), result_days: Number(input.result_days || 1),
    }).select("id").single();
    if (error || !panel) return { ok: false, error: "บันทึกแพ็กเกจไม่สำเร็จ" };
    const rows = input.serviceIds.map((sid) => ({ panel_id: panel.id, service_id: sid }));
    if (rows.length) await supabase.from("anon_panel_items").insert(rows);
    revalidatePath("/dashboard/anonymous");
    return { ok: true, id: panel.id as string };
}

export async function updateAnonPanel(id: string, input: {
    name: string; note?: string; price: number; cost?: number; result_days?: number;
    is_active?: boolean; serviceIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const { supabase, clinicId } = await getCtx();
    if (!input.name?.trim()) return { ok: false, error: "กรุณาใส่ชื่อแพ็กเกจ" };
    if (!input.serviceIds?.length) return { ok: false, error: "กรุณาเลือกเทสย่อยอย่างน้อย 1 รายการ" };
    await supabase.from("anon_panels").update({
        name: input.name.trim(), note: input.note?.trim() || null,
        price: num(input.price), cost: num(input.cost), result_days: Number(input.result_days || 1),
        is_active: input.is_active !== false,
    }).eq("id", id).eq("clinic_id", clinicId);
    await supabase.from("anon_panel_items").delete().eq("panel_id", id);
    const rows = input.serviceIds.map((sid) => ({ panel_id: id, service_id: sid }));
    if (rows.length) await supabase.from("anon_panel_items").insert(rows);
    revalidatePath("/dashboard/anonymous");
    return { ok: true };
}

export async function deleteAnonPanel(id: string): Promise<{ ok: true }> {
    const { supabase, clinicId } = await getCtx();
    await supabase.from("anon_panels").delete().eq("id", id).eq("clinic_id", clinicId);
    revalidatePath("/dashboard/anonymous");
    return { ok: true };
}

// เพิ่มแพ็กเกจเข้าเคส → แตกเป็นเทสย่อย (price 0, ไว้กรอกผล) + 1 บรรทัดค่าแพ็ก
export async function addAnonPanel(caseId: string, panelId: string): Promise<{ ok: boolean; error?: string }> {
    const { supabase, clinicId } = await getCtx();
    const { data: panel } = await supabase.from("anon_panels")
        .select("id, name, price").eq("clinic_id", clinicId).eq("id", panelId).maybeSingle();
    if (!panel) return { ok: false, error: "ไม่พบแพ็กเกจ" };
    const { data: items } = await supabase.from("anon_panel_items")
        .select("service_id, service_catalog(service_name, item_type)").eq("panel_id", panelId);
    const rows: any[] = (items || []).map((it) => {
        const sc: any = Array.isArray(it.service_catalog) ? it.service_catalog[0] : it.service_catalog;
        return {
            case_id: caseId, service_id: it.service_id,
            test_name: sc?.service_name || "เทส", item_type: sc?.item_type || "lab_external", price: 0,
        };
    });
    rows.push({
        case_id: caseId, service_id: null,
        test_name: `แพ็กเกจ · ${panel.name}`, item_type: "other", price: num(panel.price),
    });
    if (rows.length) await supabase.from("anon_case_tests").insert(rows);
    await recomputeTotal(supabase, caseId);
    revalidatePath(`/dashboard/anonymous/${caseId}`);
    return { ok: true };
}

// ── Create case ─────────────────────────────────────
async function nextCaseCode(supabase: Awaited<ReturnType<typeof getCtx>>["supabase"], clinicId: string, date: string): Promise<string> {
    const ymd = date.replace(/-/g, "").slice(2); // YYMMDD
    const { count } = await supabase
        .from("anon_cases")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId).eq("case_date", date);
    const seq = String((count || 0) + 1).padStart(3, "0");
    return `AN-${ymd}-${seq}`;
}

export async function createAnonCase(input: {
    sex?: string; age?: number | null; risk_note?: string;
    serviceIds: string[];
    panelIds?: string[];
    pre_counsel_done?: boolean; pre_counsel_note?: string;
}): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
    const { supabase, clinicId, userId } = await getCtx();
    const date = bangkokDate();

    // snapshot services
    const services = input.serviceIds.length
        ? (await supabase.from("service_catalog")
            .select("id, service_name, selling_price, item_type")
            .eq("clinic_id", clinicId).in("id", input.serviceIds)).data || []
        : [];
    // snapshot panels (แพ็กเกจ) → เทสย่อย price 0 + บรรทัดค่าแพ็กราคาเดียว
    const panelIds = input.panelIds || [];
    const panelRowsBase: any[] = [];
    if (panelIds.length) {
        const { data: pans } = await supabase.from("anon_panels")
            .select("id, name, price").eq("clinic_id", clinicId).in("id", panelIds);
        const { data: pitems } = await supabase.from("anon_panel_items")
            .select("panel_id, service_id, service_catalog(service_name, item_type)").in("panel_id", panelIds);
        for (const pan of pans || []) {
            for (const it of (pitems || []).filter((x) => x.panel_id === pan.id)) {
                const sc: any = Array.isArray(it.service_catalog) ? it.service_catalog[0] : it.service_catalog;
                panelRowsBase.push({ service_id: it.service_id, test_name: sc?.service_name || "เทส", item_type: sc?.item_type || "lab_external", price: 0 });
            }
            panelRowsBase.push({ service_id: null, test_name: `แพ็กเกจ · ${pan.name}`, item_type: "other", price: num(pan.price) });
        }
    }

    if (services.length === 0 && panelRowsBase.length === 0) return { ok: false, error: "กรุณาเลือกรายการตรวจหรือแพ็กเกจอย่างน้อย 1 รายการ" };

    const total = services.reduce((s, x) => s + num(x.selling_price), 0)
        + panelRowsBase.reduce((s, x) => s + num(x.price), 0);
    const caseCode = await nextCaseCode(supabase, clinicId, date);

    // gen verify_code (กันชนด้วย retry)
    let created: { id: string } | null = null;
    let verifyCode = "";
    let lastErr = "";
    for (let attempt = 0; attempt < 6; attempt++) {
        verifyCode = genVerifyCode();
        const { data, error } = await supabase.from("anon_cases").insert({
            clinic_id: clinicId, case_code: caseCode, verify_code: verifyCode, reg_channel: "walkin", case_date: date,
            sex: input.sex || null, age: input.age ?? null, risk_note: input.risk_note || null,
            pre_counsel_done: !!input.pre_counsel_done,
            pre_counsel_note: input.pre_counsel_note || null,
            pre_counsel_by: input.pre_counsel_done ? userId : null,
            pre_counsel_at: input.pre_counsel_done ? new Date().toISOString() : null,
            total_amount: total, status: "opened", created_by: userId,
        }).select("id").single();
        if (!error && data) { created = data as { id: string }; break; }
        lastErr = error?.message || "";
        if (!/duplicate|unique|23505/i.test(lastErr + (error?.code || ""))) break;
    }
    if (!created) return { ok: false, error: lastErr || "บันทึกไม่สำเร็จ" };
    const code = verifyCode;

    const testRows = [
        ...services.map((s) => ({
            case_id: created.id, service_id: s.id, test_name: s.service_name,
            item_type: (s.item_type as string) || "other", price: num(s.selling_price),
        })),
        ...panelRowsBase.map((r) => ({ ...r, case_id: created.id })),
    ];
    if (testRows.length) await supabase.from("anon_case_tests").insert(testRows);

    revalidatePath("/dashboard/anonymous");
    return { ok: true, id: created.id as string, code };
}

// ── เปิดเคสด้วยรหัสยืนยัน (Front Desk) ───────────────
// คนไข้แจ้งรหัส 6 หลัก → เจ้าหน้าที่ป้อน → เปิดเคส (registered → opened) แล้วเข้าถึงข้อมูลได้
export async function openCaseByCode(codeRaw: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const { supabase, clinicId } = await getCtx();
    const code = (codeRaw || "").trim().toUpperCase();
    if (!code) return { ok: false, error: "กรุณากรอกรหัสยืนยัน" };

    const { data: c } = await supabase.from("anon_cases")
        .select("id, status, code_expires_at")
        .eq("clinic_id", clinicId).eq("verify_code", code).maybeSingle();
    if (!c) return { ok: false, error: "ไม่พบรหัสนี้ — ตรวจสอบรหัสกับผู้รับบริการอีกครั้ง" };

    if (c.status === "registered") {
        if (c.code_expires_at && new Date(c.code_expires_at as string) < new Date()) {
            return { ok: false, error: "รหัสหมดอายุแล้ว (เกิน 72 ชม.) — กรุณาให้ผู้รับบริการลงทะเบียนใหม่" };
        }
        await supabase.from("anon_cases").update({ status: "opened" }).eq("id", c.id).eq("clinic_id", clinicId);
        revalidatePath("/dashboard/anonymous");
    }
    return { ok: true, id: c.id as string };
}

// ── Edit case info ──────────────────────────────────
export async function updateAnonCaseInfo(id: string, patch: {
    sex?: string | null; age?: number | null; risk_note?: string | null;
    result_appt_date?: string | null; note?: string | null;
}) {
    const { supabase, clinicId } = await getCtx();
    await supabase.from("anon_cases").update(patch).eq("id", id).eq("clinic_id", clinicId);
    revalidatePath(`/dashboard/anonymous/${id}`);
    return { ok: true };
}

// ── Vital signs (คัดกรองโดยเจ้าหน้าที่) ─────────────
export async function saveVitals(id: string, vitals: Record<string, unknown>) {
    const { supabase, clinicId, userId } = await getCtx();
    await supabase.from("anon_cases").update({
        vitals, vitals_at: new Date().toISOString(), vitals_by: userId,
    }).eq("id", id).eq("clinic_id", clinicId);
    revalidatePath(`/dashboard/anonymous/${id}`);
    return { ok: true };
}

// ── Counseling ──────────────────────────────────────
export async function setCounsel(id: string, phase: "pre" | "post", body: { done: boolean; note?: string }) {
    const { supabase, clinicId, userId } = await getCtx();
    const now = body.done ? new Date().toISOString() : null;
    const patch = phase === "pre"
        ? { pre_counsel_done: body.done, pre_counsel_note: body.note ?? null, pre_counsel_by: body.done ? userId : null, pre_counsel_at: now }
        : { post_counsel_done: body.done, post_counsel_note: body.note ?? null, post_counsel_by: body.done ? userId : null, post_counsel_at: now };
    await supabase.from("anon_cases").update(patch).eq("id", id).eq("clinic_id", clinicId);
    revalidatePath(`/dashboard/anonymous/${id}`);
    return { ok: true };
}

// ── Tests: add / remove / result ────────────────────
async function recomputeTotal(supabase: Awaited<ReturnType<typeof getCtx>>["supabase"], caseId: string) {
    const { data } = await supabase.from("anon_case_tests").select("price").eq("case_id", caseId);
    const total = (data || []).reduce((s, t) => s + num(t.price), 0);
    await supabase.from("anon_cases").update({ total_amount: total }).eq("id", caseId);
    return total;
}

export async function addAnonTest(caseId: string, serviceId: string) {
    const { supabase, clinicId } = await getCtx();
    const { data: s } = await supabase.from("service_catalog")
        .select("id, service_name, selling_price, item_type").eq("clinic_id", clinicId).eq("id", serviceId).maybeSingle();
    if (!s) return { ok: false, error: "ไม่พบรายการตรวจ" };
    await supabase.from("anon_case_tests").insert({
        case_id: caseId, service_id: s.id, test_name: s.service_name,
        item_type: (s.item_type as string) || "other", price: num(s.selling_price),
    });
    await recomputeTotal(supabase, caseId);
    revalidatePath(`/dashboard/anonymous/${caseId}`);
    return { ok: true };
}

export async function removeAnonTest(testId: string, caseId: string) {
    const { supabase } = await getCtx();
    await supabase.from("anon_case_tests").delete().eq("id", testId);
    await recomputeTotal(supabase, caseId);
    revalidatePath(`/dashboard/anonymous/${caseId}`);
    return { ok: true };
}

export async function saveTestResult(testId: string, caseId: string, body: {
    result_value?: string; result_status: string; result_note?: string;
}) {
    const { supabase, clinicId, userId } = await getCtx();
    await supabase.from("anon_case_tests").update({
        result_value: body.result_value ?? null,
        result_status: body.result_status,
        result_note: body.result_note ?? null,
        resulted_by: userId, resulted_at: new Date().toISOString(),
    }).eq("id", testId);

    // bump status: ถ้ามีผลแล้วและยังเป็น opened/collected → resulted
    const { data: c } = await supabase.from("anon_cases").select("status").eq("id", caseId).eq("clinic_id", clinicId).maybeSingle();
    if (c && (c.status === "opened" || c.status === "collected")) {
        await supabase.from("anon_cases").update({ status: "resulted" }).eq("id", caseId);
    }
    revalidatePath(`/dashboard/anonymous/${caseId}`);
    return { ok: true };
}

// ── ตัด/คืน stock kit (ตาม service_catalog.inventory_item_id) ──
type SB = Awaited<ReturnType<typeof getCtx>>["supabase"];
async function caseKitConsumption(supabase: SB, clinicId: string, caseId: string): Promise<Map<string, number>> {
    const { data: tests } = await supabase.from("anon_case_tests").select("service_id").eq("case_id", caseId);
    const serviceIds = [...new Set((tests || []).map((t) => t.service_id).filter(Boolean))] as string[];
    const consume = new Map<string, number>();
    if (serviceIds.length === 0) return consume;
    const { data: svcs } = await supabase.from("service_catalog")
        .select("id, inventory_item_id, consume_qty")
        .eq("clinic_id", clinicId).in("id", serviceIds).not("inventory_item_id", "is", null);
    const svcMap = new Map((svcs || []).map((s) => [s.id as string, { inv: s.inventory_item_id as string, qty: num(s.consume_qty) || 1 }]));
    (tests || []).forEach((t) => {
        const m = t.service_id ? svcMap.get(t.service_id as string) : undefined;
        if (m?.inv) consume.set(m.inv, (consume.get(m.inv) || 0) + m.qty);
    });
    return consume;
}
async function applyKitStock(supabase: SB, clinicId: string, caseId: string, ref: string, sign: -1 | 1) {
    const consume = await caseKitConsumption(supabase, clinicId, caseId);
    for (const [itemId, qty] of consume) {
        const { data: item } = await supabase.from("inventory")
            .select("stock_qty, branch_id").eq("id", itemId).eq("clinic_id", clinicId).maybeSingle();
        if (!item) continue;
        const delta = sign * qty;
        const newStock = num(item.stock_qty) + delta;
        await supabase.from("inventory").update({ stock_qty: newStock, updated_at: new Date().toISOString() }).eq("id", itemId);
        await supabase.from("stock_card").insert({
            item_id: itemId, clinic_id: clinicId, branch_id: item.branch_id || null,
            tx_type: sign < 0 ? "INTERNAL_USE" : "ADJUST_IN",
            qty_delta: delta, balance_after: newStock, ref_inv_id: `ANON:${ref || caseId}`,
        });
        // FEFO: ตัด/คืน ล็อตตามทิศ
        if (sign < 0) await deductFEFO(supabase, clinicId, itemId, qty);
        else await restoreFEFO(supabase, clinicId, itemId, qty);
    }
}

// ── Payment (ใบเสร็จนิรนาม) ─────────────────────────
export async function recordAnonPayment(id: string, payment_method: string) {
    const { supabase, clinicId } = await getCtx();
    const total = await recomputeTotal(supabase, id);
    const { data: c } = await supabase.from("anon_cases")
        .select("case_code, verify_code, receipt_no, stock_deducted").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    const ref = (c?.verify_code as string) || (c?.case_code as string) || id.slice(0, 8);
    const receipt = c?.receipt_no || `AR-${ref}`;
    await supabase.from("anon_cases").update({
        paid: true, payment_method, paid_at: new Date().toISOString(),
        receipt_no: receipt, total_amount: total,
    }).eq("id", id).eq("clinic_id", clinicId);

    // ตัด stock kit ครั้งเดียว (กันตัดซ้ำด้วย stock_deducted)
    if (c && !c.stock_deducted) {
        await applyKitStock(supabase, clinicId, id, ref, -1);
        await supabase.from("anon_cases").update({ stock_deducted: true }).eq("id", id).eq("clinic_id", clinicId);
    }
    revalidatePath(`/dashboard/anonymous/${id}`);
    return { ok: true };
}

export async function cancelAnonPayment(id: string) {
    const { supabase, clinicId } = await getCtx();
    const { data: c } = await supabase.from("anon_cases")
        .select("verify_code, case_code, stock_deducted, paid_at").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    // ล็อก: ถ้าวันที่จ่ายถูกปิดยอดแล้ว ห้ามยกเลิกการชำระ
    if (c?.paid_at && await isDayClosed(supabase, clinicId, bangkokDate(new Date(c.paid_at as string)))) {
        return { ok: false, error: DAY_LOCKED_MSG };
    }
    await supabase.from("anon_cases").update({ paid: false, paid_at: null, payment_method: null })
        .eq("id", id).eq("clinic_id", clinicId);

    // คืน stock ถ้าเคยตัดไปแล้ว
    if (c && c.stock_deducted) {
        const ref = (c.verify_code as string) || (c.case_code as string) || id.slice(0, 8);
        await applyKitStock(supabase, clinicId, id, ref, 1);
        await supabase.from("anon_cases").update({ stock_deducted: false }).eq("id", id).eq("clinic_id", clinicId);
    }
    revalidatePath(`/dashboard/anonymous/${id}`);
    return { ok: true };
}

// ── Status / delete ─────────────────────────────────
export async function setAnonStatus(id: string, status: string) {
    const { supabase, clinicId } = await getCtx();
    // guard: จะตั้งเป็น "resulted" (มีผลแล้ว) ได้ ต่อเมื่อกรอกผลรายการตรวจครบทุกรายการ
    if (status === "resulted") {
        const { data: tests } = await supabase.from("anon_case_tests")
            .select("item_type, result_status").eq("case_id", id);
        const labs = (tests || []).filter((t) => t.item_type === "lab" || t.item_type === "lab_external");
        const pending = labs.filter((t) => t.result_status === "pending" || t.result_status === "sent_out");
        if (labs.length === 0) return { ok: false as const, error: 'เคสนี้ยังไม่มีรายการตรวจ — ตั้งเป็น "มีผลแล้ว" ไม่ได้' };
        if (pending.length > 0) return { ok: false as const, error: `ยังกรอกผลไม่ครบ (เหลือ ${pending.length} รายการรอผล) — กรอกผลให้ครบก่อนตั้งเป็น "มีผลแล้ว"` };
    }
    await supabase.from("anon_cases").update({ status }).eq("id", id).eq("clinic_id", clinicId);
    revalidatePath(`/dashboard/anonymous/${id}`);
    revalidatePath("/dashboard/anonymous");
    return { ok: true as const };
}

export async function deleteAnonCase(id: string) {
    const { supabase, clinicId } = await getCtx();
    await supabase.from("anon_cases").delete().eq("id", id).eq("clinic_id", clinicId);
    revalidatePath("/dashboard/anonymous");
    return { ok: true };
}
