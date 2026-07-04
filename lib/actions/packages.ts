"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import type {
    ServicePackage,
    PatientPackage,
    PatientPackageActive,
    PackageUsage,
} from "@/lib/package-types";

// ════════════════════════════════════════════════════════════
// Catalog (service_packages)
// ════════════════════════════════════════════════════════════

/** คอสที่ขายแล้วทั้งคลินิก (สำหรับหน้าสรุปคอส) — รวมชื่อผู้ป่วย */
export async function getAllSoldPackages(): Promise<import("@/lib/package-types").SoldPackageRow[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("v_patient_packages_active")
            .select("id, hn, package_name, category, total_sessions, used_sessions, remaining_sessions, paid_amount, purchased_at, expires_at, status, invoice_id, is_expired, days_remaining")
            .eq("clinic_id", profile.clinic_id)
            .in("status", ["active", "completed", "expired"])
            .order("expires_at", { ascending: true });
        const rows = data || [];

        // ชื่อผู้ป่วยจาก hn
        const hns = [...new Set(rows.map((r) => r.hn as string).filter(Boolean))];
        const nameMap: Record<string, string> = {};
        if (hns.length > 0) {
            const { data: pts } = await supabase.from("patients").select("hn, prefix, first_name, last_name").in("hn", hns);
            for (const p of pts || []) nameMap[p.hn as string] = `${p.prefix || ""}${p.first_name || ""} ${p.last_name || ""}`.trim();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rows.map((r: any) => ({
            id: r.id, hn: r.hn, patientName: nameMap[r.hn] || r.hn,
            package_name: r.package_name, category: r.category ?? null,
            total_sessions: Number(r.total_sessions || 0), used_sessions: Number(r.used_sessions || 0),
            remaining_sessions: Number(r.remaining_sessions || 0), paid_amount: Number(r.paid_amount || 0),
            purchased_at: r.purchased_at, expires_at: r.expires_at, status: r.status,
            invoice_id: r.invoice_id ?? null, is_expired: !!r.is_expired, days_remaining: Number(r.days_remaining || 0),
        }));
    } catch {
        return [];
    }
}

/** Deferred Revenue — มูลค่าคอร์ส/แพ็กเกจที่ขายแล้วแต่ยังไม่ได้ใช้ (Outstanding Value) */
export async function getDeferredRevenue(): Promise<{ outstanding: number; count: number }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { outstanding: 0, count: 0 };
        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { outstanding: 0, count: 0 };

        // ใช้ view v_patient_packages_active (มี remaining_sessions + paid_amount ตาม schema 038)
        const { data } = await supabase
            .from("v_patient_packages_active")
            .select("paid_amount, total_sessions, remaining_sessions")
            .eq("clinic_id", profile.clinic_id)
            .eq("status", "active");

        let outstanding = 0, count = 0;
        for (const p of data || []) {
            const ts = Number(p.total_sessions || 0);
            const rem = Number(p.remaining_sessions || 0);
            const paid = Number(p.paid_amount || 0);
            if (ts > 0 && rem > 0) { outstanding += paid * rem / ts; count++; }
        }
        return { outstanding: Math.round(outstanding * 100) / 100, count };
    } catch {
        return { outstanding: 0, count: 0 };
    }
}

/** นับคอสที่ active + ใกล้หมดอายุภายใน N วัน (ยังมีครั้งเหลือ) — สำหรับแจ้งเตือน */
export async function getExpiringPackagesCount(days = 30): Promise<{ count: number; soonestDays: number | null }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { count: 0, soonestDays: null };
        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { count: 0, soonestDays: null };

        const { data } = await supabase
            .from("v_patient_packages_active")
            .select("remaining_sessions, days_remaining, is_expired")
            .eq("clinic_id", profile.clinic_id)
            .eq("status", "active");

        let count = 0;
        let soonestDays: number | null = null;
        for (const p of data || []) {
            const rem = Number(p.remaining_sessions || 0);
            const dleft = Number(p.days_remaining ?? 9999);
            if (p.is_expired || rem <= 0) continue;
            if (dleft <= days) {
                count++;
                if (soonestDays === null || dleft < soonestDays) soonestDays = dleft;
            }
        }
        return { count, soonestDays };
    } catch {
        return { count: 0, soonestDays: null };
    }
}

export async function listActivePackages(): Promise<ServicePackage[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("service_packages")
            .select("id, code, name, description, category, total_sessions, price, validity_days, is_active, sales_commission_pct, commission_doctor_pct, commission_nurse_pct, max_discount_pct")
            .eq("clinic_id", profile.clinic_id)
            .eq("is_active", true)
            .order("category")
            .order("name");

        return (data || []) as ServicePackage[];
    } catch {
        return [];
    }
}

export async function listAllPackages(): Promise<ServicePackage[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("service_packages")
            .select("*")
            .eq("clinic_id", profile.clinic_id)
            .order("is_active", { ascending: false })
            .order("category")
            .order("name");

        return (data || []) as ServicePackage[];
    } catch {
        return [];
    }
}

export async function getPackageById(id: string): Promise<ServicePackage | null> {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("service_packages")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        return (data || null) as ServicePackage | null;
    } catch {
        return null;
    }
}

export interface PackageInput {
    code?: string;
    name: string;
    description?: string;
    category?: string;
    total_sessions: number;
    price: number;
    validity_days?: number;
    is_active?: boolean;
    sales_commission_pct?: number;
    commission_doctor_pct?: number | null;
    commission_nurse_pct?: number | null;
    max_discount_pct?: number | null;
}

async function generatePackageCode(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    clinicId: string,
    category?: string
): Promise<string> {
    const prefix = (category || "PKG").toUpperCase().slice(0, 4);
    const { count } = await supabase
        .from("service_packages")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId);
    const next = (count || 0) + 1;
    return `${prefix}-${String(next).padStart(3, "0")}`;
}

export async function createPackage(input: PackageInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        if (!input.name?.trim()) return { success: false, error: "กรุณากรอกชื่อคอส" };
        if (input.total_sessions < 1) return { success: false, error: "จำนวนครั้งต้องมากกว่า 0" };
        if (input.price < 0) return { success: false, error: "ราคาต้องไม่ติดลบ" };

        const code = input.code?.trim() ||
            await generatePackageCode(supabase, profile.clinic_id, input.category);

        const { data, error } = await supabase
            .from("service_packages")
            .insert({
                clinic_id: profile.clinic_id,
                code,
                name: input.name.trim(),
                description: input.description?.trim() || null,
                category: input.category?.trim() || null,
                total_sessions: input.total_sessions,
                price: input.price,
                validity_days: input.validity_days ?? 365,
                is_active: input.is_active ?? true,
                sales_commission_pct: input.sales_commission_pct ?? 0,
                commission_doctor_pct: input.commission_doctor_pct ?? null,
                commission_nurse_pct: input.commission_nurse_pct ?? null,
                max_discount_pct: input.max_discount_pct ?? null,
            })
            .select("id")
            .single();

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/inventory/packages");
        return { success: true, id: data.id };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export async function updatePackage(id: string, input: Partial<PackageInput>) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {};
        if (input.code !== undefined) patch.code = input.code.trim();
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.description !== undefined) patch.description = input.description?.trim() || null;
        if (input.category !== undefined) patch.category = input.category?.trim() || null;
        if (input.total_sessions !== undefined) patch.total_sessions = input.total_sessions;
        if (input.price !== undefined) patch.price = input.price;
        if (input.validity_days !== undefined) patch.validity_days = input.validity_days;
        if (input.is_active !== undefined) patch.is_active = input.is_active;
        if (input.sales_commission_pct !== undefined) patch.sales_commission_pct = input.sales_commission_pct;
        if (input.commission_doctor_pct !== undefined) patch.commission_doctor_pct = input.commission_doctor_pct;
        if (input.commission_nurse_pct !== undefined) patch.commission_nurse_pct = input.commission_nurse_pct;
        if (input.max_discount_pct !== undefined) patch.max_discount_pct = input.max_discount_pct;

        // ราคาเปลี่ยน → log ประวัติ (ราคาเก่า→ใหม่ ใครเปลี่ยน) — ลูกค้าเก่าไม่กระทบ (snapshot ตอนซื้อ)
        if (input.price !== undefined) {
            const { data: cur } = await supabase.from("service_packages").select("price").eq("id", id).maybeSingle();
            const oldPrice = cur ? Number(cur.price) : null;
            if (oldPrice !== null && oldPrice !== Number(input.price) && profile?.clinic_id) {
                await supabase.from("package_price_history").insert({
                    clinic_id: profile.clinic_id, package_id: id, old_price: oldPrice, new_price: input.price, changed_by: user.id,
                });
            }
        }

        const { error } = await supabase
            .from("service_packages")
            .update(patch)
            .eq("id", id);

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/inventory/packages");
        revalidatePath(`/dashboard/inventory/packages/${id}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export async function deletePackage(id: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // Soft delete (set is_active=false) ถ้ามีคนซื้อแล้ว
        const { count } = await supabase
            .from("patient_packages")
            .select("id", { count: "exact", head: true })
            .eq("package_id", id);

        if (count && count > 0) {
            const { error } = await supabase
                .from("service_packages")
                .update({ is_active: false })
                .eq("id", id);
            if (error) return { success: false, error: error.message };
            revalidatePath("/dashboard/inventory/packages");
            return { success: true, softDeleted: true };
        }

        const { error } = await supabase
            .from("service_packages")
            .delete()
            .eq("id", id);
        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/inventory/packages");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

// ════════════════════════════════════════════════════════════
// Purchase (patient_packages)
// ════════════════════════════════════════════════════════════

export interface PurchasePackageInput {
    hn: string;
    package_id: string;
    invoice_id?: string;       // link กับใบเสร็จ (ถ้ามาจาก checkout); ถ้าไม่ส่ง → สร้างใบเสร็จให้
    paid_amount?: number;      // ถ้าไม่ส่ง ใช้ราคา catalog
    payment_method?: "cash" | "transfer" | "credit";  // สำหรับขายตรง (สร้างใบเสร็จ)
    note?: string;
}

export async function purchasePackage(input: PurchasePackageInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { data: pkg } = await supabase
            .from("service_packages")
            .select("id, name, total_sessions, price, validity_days, is_active")
            .eq("id", input.package_id)
            .maybeSingle();
        if (!pkg) return { success: false, error: "ไม่พบคอสนี้" };
        if (!pkg.is_active) return { success: false, error: "คอสนี้ถูกปิดการใช้งาน" };

        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + (pkg.validity_days || 365));

        const { data: staffRow } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();

        const amount = input.paid_amount ?? Number(pkg.price);

        // ── ขายตรง (ไม่มี invoice_id) → สร้างใบเสร็จ + payment เข้าระบบการเงิน ──
        let invoiceId = input.invoice_id || null;
        if (!invoiceId) {
            const newInvId = `INV-${Date.now().toString().slice(-6)}-${input.hn.slice(-4)}`;
            const { error: invErr } = await supabase.from("invoice_headers").insert({
                id: newInvId, clinic_id: profile.clinic_id, hn: input.hn,
                invoice_date: bangkokDate(), subtotal: amount, total_amount: amount,
                paid_amount: amount, status: "paid", issued_by: staffRow?.id || null,
            });
            if (invErr) return { success: false, error: `สร้างใบเสร็จไม่สำเร็จ: ${invErr.message}` };
            await supabase.from("invoice_items").insert({
                inv_id: newInvId, clinic_id: profile.clinic_id, item_type: "package",
                item_ref_id: input.package_id, item_name: pkg.name, qty: 1,
                unit_price: amount, line_total: amount, segment: "aesthetic",
            });
            const dbMethod = input.payment_method === "credit" ? "credit_card" : (input.payment_method || "cash");
            await supabase.from("payment_logs").insert({
                inv_id: newInvId, clinic_id: profile.clinic_id, payment_method: dbMethod, amount,
            });
            invoiceId = newInvId;
        }

        const { data, error } = await supabase
            .from("patient_packages")
            .insert({
                clinic_id: profile.clinic_id,
                hn: input.hn,
                package_id: input.package_id,
                invoice_id: invoiceId,
                package_name: pkg.name,
                total_sessions: pkg.total_sessions,
                paid_amount: input.paid_amount ?? pkg.price,
                purchased_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
                note: input.note?.trim() || null,
                created_by: staffRow?.id || null,
            })
            .select("id")
            .single();

        if (error) return { success: false, error: error.message };

        revalidatePath(`/dashboard/patients/${input.hn}`);
        revalidatePath("/dashboard/inventory/packages");
        revalidatePath(`/dashboard/inventory/packages/${input.package_id}`);
        return { success: true, id: data.id };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

// ════════════════════════════════════════════════════════════
// Use session (package_usages)
// ════════════════════════════════════════════════════════════

export interface UsePackageSessionInput {
    patient_package_id: string;
    visit_vn?: string;
    note?: string;
}

export async function usePackageSession(input: UsePackageSessionInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // Fetch sub-package
        const { data: pp } = await supabase
            .from("patient_packages")
            .select("id, hn, clinic_id, package_id, total_sessions, used_sessions, status, expires_at")
            .eq("id", input.patient_package_id)
            .single();
        if (!pp) return { success: false, error: "ไม่พบสิทธิ์คอสนี้" };

        if (pp.status !== "active") {
            return { success: false, error: "คอสนี้ไม่อยู่ในสถานะใช้งานได้" };
        }
        if (new Date(pp.expires_at) < new Date()) {
            // Auto-expire
            await supabase.from("patient_packages")
                .update({ status: "expired" })
                .eq("id", pp.id);
            return { success: false, error: "คอสนี้หมดอายุแล้ว" };
        }

        const remaining = pp.total_sessions - pp.used_sessions;
        if (remaining <= 0) {
            return { success: false, error: "ใช้ครบจำนวนครั้งแล้ว" };
        }

        const sessionNo = pp.used_sessions + 1;

        const { data: staffRow } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();

        // Insert usage
        const { error: insErr } = await supabase
            .from("package_usages")
            .insert({
                clinic_id: pp.clinic_id,
                patient_package_id: pp.id,
                visit_vn: input.visit_vn || null,
                session_no: sessionNo,
                used_by: staffRow?.id || null,
                note: input.note?.trim() || null,
            });
        if (insErr) return { success: false, error: insErr.message };

        // Increment used_sessions + auto-complete ถ้าครบ
        const newUsed = pp.used_sessions + 1;
        const newStatus = newUsed >= pp.total_sessions ? "completed" : "active";

        const { error: upErr } = await supabase
            .from("patient_packages")
            .update({ used_sessions: newUsed, status: newStatus })
            .eq("id", pp.id);
        if (upErr) return { success: false, error: upErr.message };

        revalidatePath(`/dashboard/patients/${pp.hn}`);
        if (input.visit_vn) revalidatePath(`/dashboard/visits/${input.visit_vn}`);
        revalidatePath("/dashboard/doctor-station");

        return {
            success: true,
            session_no: sessionNo,
            remaining: pp.total_sessions - newUsed,
            completed: newStatus === "completed",
        };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Undo การตัดครั้งล่าสุด (กรณีกดผิด) */
export async function undoPackageUsage(usageId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: usage } = await supabase
            .from("package_usages")
            .select("id, patient_package_id, session_no")
            .eq("id", usageId)
            .single();
        if (!usage) return { success: false, error: "ไม่พบรายการ" };

        const { data: pp } = await supabase
            .from("patient_packages")
            .select("id, hn, used_sessions, total_sessions, status")
            .eq("id", usage.patient_package_id)
            .single();
        if (!pp) return { success: false, error: "ไม่พบสิทธิ์คอส" };

        // ต้องเป็นครั้งล่าสุดเท่านั้น
        if (usage.session_no !== pp.used_sessions) {
            return { success: false, error: "Undo ได้เฉพาะครั้งล่าสุด" };
        }

        // Delete usage + decrement
        const { error: delErr } = await supabase
            .from("package_usages")
            .delete()
            .eq("id", usageId);
        if (delErr) return { success: false, error: delErr.message };

        const newUsed = pp.used_sessions - 1;
        const newStatus = pp.status === "completed" ? "active" : pp.status;

        await supabase
            .from("patient_packages")
            .update({ used_sessions: newUsed, status: newStatus })
            .eq("id", pp.id);

        revalidatePath(`/dashboard/patients/${pp.hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

// ════════════════════════════════════════════════════════════
// Query helpers
// ════════════════════════════════════════════════════════════

/** ดึงคอสคงเหลือของคนไข้ (active) */
export async function getPatientActivePackages(hn: string): Promise<PatientPackageActive[]> {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("v_patient_packages_active")
            .select("*")
            .eq("hn", hn)
            .eq("status", "active")
            .order("expires_at", { ascending: true });
        return (data || []) as PatientPackageActive[];
    } catch {
        return [];
    }
}

/** ดึงคอสทั้งหมดของคนไข้ (รวม expired/completed) */
export async function getPatientAllPackages(hn: string): Promise<PatientPackageActive[]> {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("v_patient_packages_active")
            .select("*")
            .eq("hn", hn)
            .order("purchased_at", { ascending: false });
        return (data || []) as PatientPackageActive[];
    } catch {
        return [];
    }
}

/** ดึงประวัติการใช้สิทธิ์ของ patient_package */
export async function getPackageUsages(patientPackageId: string): Promise<PackageUsage[]> {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("package_usages")
            .select(`
                id, patient_package_id, visit_vn, session_no, used_at, used_by, note,
                used_by_staff:staff!package_usages_used_by_fkey(profiles(full_name))
            `)
            .eq("patient_package_id", patientPackageId)
            .order("session_no", { ascending: true });
        return (data || []) as unknown as PackageUsage[];
    } catch {
        return [];
    }
}

/** ดึงรายชื่อคนไข้ที่ซื้อคอสนี้ (สำหรับ detail page) */
export async function getPackagePurchases(packageId: string) {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("patient_packages")
            .select(`
                id, hn, package_name, total_sessions, used_sessions,
                paid_amount, purchased_at, expires_at, status, invoice_id,
                patient:patients!patient_packages_hn_fkey(first_name, last_name, prefix, phone)
            `)
            .eq("package_id", packageId)
            .order("purchased_at", { ascending: false });
        return data || [];
    } catch {
        return [];
    }
}

export interface PriceHistoryRow { id: string; old_price: number | null; new_price: number; changed_by_name: string | null; created_at: string; }

/** ประวัติการเปลี่ยนราคาคอส */
export async function getPackagePriceHistory(packageId: string): Promise<PriceHistoryRow[]> {
    try {
        const supabase = await createClient();
        const { data } = await supabase.from("package_price_history")
            .select("id, old_price, new_price, changed_by, created_at, profiles:changed_by(full_name)")
            .eq("package_id", packageId).order("created_at", { ascending: false }).limit(50);
        return (data || []).map(r => {
            const rel = r.profiles as unknown as { full_name?: string } | { full_name?: string }[] | null;
            const name = Array.isArray(rel) ? rel[0]?.full_name : rel?.full_name;
            return {
                id: r.id as string, old_price: r.old_price !== null ? Number(r.old_price) : null,
                new_price: Number(r.new_price), changed_by_name: name || null, created_at: r.created_at as string,
            };
        });
    } catch {
        return [];
    }
}

/** Auto-expire packages that passed expires_at */
export async function autoExpirePackages() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { data, error } = await supabase
            .from("patient_packages")
            .update({ status: "expired" })
            .eq("clinic_id", profile.clinic_id)
            .eq("status", "active")
            .lt("expires_at", new Date().toISOString())
            .select("id");

        if (error) return { success: false, error: error.message };
        return { success: true, expired: data?.length || 0 };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Refund คอส (เปลี่ยนสถานะ + อาจคืนเงินผ่าน invoice แยก) */
export async function refundPackage(patientPackageId: string, reason: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        if (!reason?.trim()) return { success: false, error: "กรุณาระบุเหตุผล" };

        const { data: pp } = await supabase
            .from("patient_packages")
            .select("id, hn, status, note")
            .eq("id", patientPackageId)
            .single();
        if (!pp) return { success: false, error: "ไม่พบสิทธิ์" };

        if (pp.status !== "active") {
            return { success: false, error: "คืนได้เฉพาะคอสที่ใช้งานอยู่" };
        }

        const newNote = [pp.note, `[คืนเงิน] ${reason.trim()}`].filter(Boolean).join("\n");

        const { error } = await supabase
            .from("patient_packages")
            .update({ status: "refunded", note: newNote })
            .eq("id", patientPackageId);
        if (error) return { success: false, error: error.message };

        revalidatePath(`/dashboard/patients/${pp.hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
