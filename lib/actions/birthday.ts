"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushLineText } from "@/lib/line";
import { bangkokDate } from "@/lib/utils/date";
import { DEFAULT_BIRTHDAY_MESSAGE } from "@/lib/birthday";

// วันเกิดคนไข้ — แจ้งเตือน + ส่ง HBD (กดส่งเอง) + คูปองวันเกิด (มูลค่าตั้งทีหลัง · รวมกับระบบแต้มในอนาคต)

export interface BirthdayRow {
    hn: string; name: string; nickname: string | null; phone: string | null;
    dob: string; bday: string; age: number; hasLine: boolean; lastVisit: string | null;
    greeted: "line" | "manual" | null; greetedAt: string | null;
    coupon: { id: string; status: string; title: string; valueLabel: string } | null;
}
export interface BirthdayData {
    today: string; month: string;
    rows: BirthdayRow[];          // วันนี้ → สิ้นเดือนหน้า 7 วัน (เรียงตามวันเกิด)
    message: string;              // template
    clinicName: string;
    couponConfigured: boolean;
}


async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, role").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("ไม่พบคลินิก");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string, role: String(profile.role) };
}

const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const monthEnd = (d: string) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

function fill(tpl: string, r: { name: string; nickname: string | null }, clinic: string) {
    return tpl.replaceAll("{name}", r.name).replaceAll("{nickname}", r.nickname || r.name.split(" ")[0] || "").replaceAll("{clinic}", clinic);
}

async function couponValue(supabase: Awaited<ReturnType<typeof createClient>>, clinicId: string, day: string) {
    const [{ data: pct }, { data: max }] = await Promise.all([
        supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: "birthday_coupon_pct", p_date: day }),
        supabase.rpc("fn_finance_rate", { p_clinic: clinicId, p_key: "birthday_coupon_max", p_date: day }),
    ]);
    const p = Number(pct || 0), m = Number(max || 0);
    return { pct: p, max: m, configured: p > 0 };
}

export async function getBirthdayData(): Promise<BirthdayData | { error: string }> {
    try {
        const { supabase, clinicId } = await ctx();
        const today = bangkokDate();
        const year = Number(today.slice(0, 4));
        const from = `${today.slice(0, 7)}-01`;
        const to = addDays(monthEnd(today), 7);
        const [{ data, error }, { data: tenant }, cv] = await Promise.all([
            supabase.rpc("fn_birthdays_between", { p_from: from, p_to: to }),
            supabase.from("tenants").select("clinic_name, birthday_message").eq("id", clinicId).maybeSingle(),
            couponValue(supabase, clinicId, today),
        ]);
        if (error) return { error: error.message };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (data || []) as any[];
        const hns = list.map(r => r.hn as string);
        const [{ data: greets }, { data: coupons }] = hns.length ? await Promise.all([
            supabase.from("birthday_greetings").select("hn, channel, sent_at").eq("clinic_id", clinicId).eq("year", year).in("hn", hns).order("sent_at", { ascending: false }),
            supabase.from("patient_coupons").select("id, hn, status, title, discount_mode, discount_value, max_discount").eq("clinic_id", clinicId).eq("kind", "birthday").eq("source_year", year).in("hn", hns),
        ]) : [{ data: [] }, { data: [] }];
        const gMap = new Map<string, { channel: string; sent_at: string }>();
        (greets || []).forEach(g => { if (!gMap.has(g.hn as string)) gMap.set(g.hn as string, { channel: g.channel as string, sent_at: g.sent_at as string }); });
        const cMap = new Map((coupons || []).map(c => [c.hn as string, c]));
        const rows: BirthdayRow[] = list.map(r => {
            const g = gMap.get(r.hn), c = cMap.get(r.hn);
            return {
                hn: r.hn, name: `${r.prefix || ""}${r.first_name || ""} ${r.last_name || ""}`.trim(), nickname: r.nickname || null, phone: r.phone || null,
                dob: r.dob, bday: r.bday, age: Number(r.age), hasLine: !!r.has_line, lastVisit: r.last_visit || null,
                greeted: (g?.channel as "line" | "manual") || null, greetedAt: g?.sent_at || null,
                coupon: c ? {
                    id: c.id as string, status: c.status as string, title: c.title as string,
                    valueLabel: c.discount_mode === "pct" ? `ลด ${Number(c.discount_value)}%${c.max_discount ? ` (สูงสุด ฿${Number(c.max_discount).toLocaleString()})` : ""}`
                        : c.discount_mode === "fixed" ? `ลด ฿${Number(c.discount_value).toLocaleString()}` : "ยังไม่ได้ตั้งมูลค่า",
                } : null,
            };
        });
        return {
            today, month: today.slice(0, 7), rows,
            message: (tenant?.birthday_message as string) || DEFAULT_BIRTHDAY_MESSAGE,
            clinicName: (tenant?.clinic_name as string) || "คลินิก", couponConfigured: cv.configured,
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

/** ข้อความอวยพรที่แทนค่าแล้ว (ไว้คัดลอกส่งเอง) */
export async function getBirthdayMessageFor(hn: string): Promise<string> {
    const { supabase, clinicId } = await ctx();
    const [{ data: p }, { data: t }] = await Promise.all([
        supabase.from("patients").select("prefix, first_name, last_name, nickname").eq("hn", hn).maybeSingle(),
        supabase.from("tenants").select("clinic_name, birthday_message").eq("id", clinicId).maybeSingle(),
    ]);
    const name = `${p?.prefix || ""}${p?.first_name || ""} ${p?.last_name || ""}`.trim();
    return fill((t?.birthday_message as string) || DEFAULT_BIRTHDAY_MESSAGE, { name, nickname: (p?.nickname as string) || null }, (t?.clinic_name as string) || "คลินิก");
}

/** ส่ง HBD ทาง LINE (คนไข้ที่ผูก LINE แล้ว) */
export async function sendBirthdayLine(hn: string) {
    try {
        const { supabase, clinicId, userId } = await ctx();
        const { data: p } = await supabase.from("patients").select("line_user_id").eq("hn", hn).maybeSingle();
        if (!p?.line_user_id) return { success: false, error: "คนไข้ยังไม่ได้ผูก LINE — ใช้ปุ่มคัดลอกข้อความแทน" };
        const msg = await getBirthdayMessageFor(hn);
        const res = await pushLineText(p.line_user_id as string, msg);
        if (!res.ok) return { success: false, error: `ส่ง LINE ไม่สำเร็จ: ${res.error || "ตรวจการตั้งค่า LINE OA"}` };
        await supabase.from("birthday_greetings").insert({ clinic_id: clinicId, hn, year: Number(bangkokDate().slice(0, 4)), channel: "line", message: msg, sent_by: userId });
        revalidatePath("/dashboard/follow-up");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "ส่งไม่สำเร็จ" };
    }
}

/** บันทึกว่าอวยพรแล้ว (ส่งเองทางโทร/แชท) */
export async function markBirthdayGreeted(hn: string) {
    try {
        const { supabase, clinicId, userId } = await ctx();
        await supabase.from("birthday_greetings").insert({ clinic_id: clinicId, hn, year: Number(bangkokDate().slice(0, 4)), channel: "manual", sent_by: userId });
        revalidatePath("/dashboard/follow-up");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}

/** ออกคูปองวันเกิดปีนี้ (ใช้ได้ทั้งเดือนเกิด · ฝั่งความงาม) — มูลค่าจากอัตราการเงิน ถ้ายังไม่ตั้งออกได้แต่ยังไม่มีมูลค่า */
export async function issueBirthdayCoupon(hn: string) {
    try {
        const { supabase, clinicId, userId } = await ctx();
        const today = bangkokDate();
        const year = Number(today.slice(0, 4));
        const { data: p } = await supabase.from("patients").select("dob").eq("hn", hn).maybeSingle();
        if (!p?.dob) return { success: false, error: "คนไข้ไม่มีวันเกิดในระบบ" };
        const m = String(p.dob).slice(5, 7);
        const validFrom = `${year}-${m}-01`;
        const validUntil = monthEnd(validFrom);
        const cv = await couponValue(supabase, clinicId, today);
        const { error } = await supabase.from("patient_coupons").insert({
            clinic_id: clinicId, hn, kind: "birthday", title: `คูปองวันเกิด ${year + 543}`,
            discount_mode: cv.configured ? "pct" : null, discount_value: cv.configured ? cv.pct : null, max_discount: cv.configured && cv.max > 0 ? cv.max : null,
            applies_to: "aesthetic", valid_from: validFrom, valid_until: validUntil, source_year: year, created_by: userId,
        });
        if (error) return { success: false, error: error.code === "23505" ? "ออกคูปองวันเกิดปีนี้ให้คนไข้รายนี้แล้ว" : error.message };
        revalidatePath("/dashboard/follow-up");
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "ออกคูปองไม่สำเร็จ" };
    }
}

export async function setBirthdayMessage(text: string) {
    try {
        const { supabase, clinicId, role } = await ctx();
        if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะเจ้าของ/แอดมิน" };
        const { error } = await supabase.from("tenants").update({ birthday_message: text.trim() || null }).eq("id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/follow-up");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}

/** คูปองของคนไข้ (หน้าประวัติ) */
export async function getPatientCoupons(hn: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("patient_coupons").select("id, kind, title, discount_mode, discount_value, max_discount, applies_to, valid_from, valid_until, status, used_at")
            .eq("clinic_id", clinicId).eq("hn", hn).order("created_at", { ascending: false });
        return data || [];
    } catch {
        return [];
    }
}
