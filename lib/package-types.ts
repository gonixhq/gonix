/**
 * Service package types — shared between server & client.
 */

export type PackageStatus = "active" | "completed" | "expired" | "refunded" | "cancelled";

/** รหัสคอสแบบอ่านง่าย (อ้างอิงด้วยวาจา/กระดาษ) — derive จาก id (ไม่ต้องเก็บคอลัมน์) */
export const pkgCode = (id: string) => "PKG-" + String(id || "").slice(0, 8).toUpperCase();

export interface SoldPackageRow {
    id: string;
    hn: string;
    patientName: string;
    package_name: string;
    category: string | null;
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    paid_amount: number;
    purchased_at: string;
    expires_at: string;
    status: string;
    invoice_id: string | null;
    is_expired: boolean;
    days_remaining: number;
}

export interface ServicePackage {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: string | null;
    total_sessions: number;
    price: number;
    validity_days: number;
    is_active: boolean;
    sales_commission_pct?: number | null;
    commission_doctor_pct?: number | null;
    commission_nurse_pct?: number | null;
    max_discount_pct?: number | null;
    is_bundle?: boolean;
    consume_item_id?: string | null;
    consume_qty_per_session?: number | null;
    created_at?: string;
    updated_at?: string;
}

export interface PatientPackage {
    id: string;
    clinic_id: string;
    hn: string;
    package_id: string;
    invoice_id: string | null;
    package_name: string;
    total_sessions: number;
    used_sessions: number;
    paid_amount: number;
    purchased_at: string;
    expires_at: string;
    status: PackageStatus;
    note: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface PatientPackageActive extends PatientPackage {
    remaining_sessions: number;
    category: string | null;
    is_expired: boolean;
    days_remaining: number;
}

export interface PackageUsage {
    id: string;
    patient_package_id: string;
    visit_vn: string | null;
    session_no: number;
    used_at: string;
    used_by: string | null;
    note: string | null;
}

export const PACKAGE_STATUS_LABEL: Record<PackageStatus, string> = {
    active: "ใช้งานได้",
    completed: "ใช้ครบแล้ว",
    expired: "หมดอายุ",
    refunded: "คืนเงินแล้ว",
    cancelled: "ยกเลิก",
};

export const PACKAGE_STATUS_COLOR: Record<PackageStatus, string> = {
    active: "bg-teal-100 text-teal-700",
    completed: "bg-slate-100 text-slate-700",
    expired: "bg-amber-100 text-amber-700",
    refunded: "bg-rose-100 text-rose-700",
    cancelled: "bg-slate-100 text-slate-500",
};

export const PACKAGE_CATEGORIES = [
    "HIFU",
    "DRIP",
    "FILLER",
    "BOTOX",
    "LASER",
    "MESO",
    "FACIAL",
    "BODY",
    "OTHER",
] as const;

export type PackageCategory = typeof PACKAGE_CATEGORIES[number];
