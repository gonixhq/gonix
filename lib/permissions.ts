/* ============================================================
 * Permission catalog + defaults per role.
 * Used by:
 *   - Staff Management → "สิทธิ์ตาม Role" tab (edit)
 *   - App pages (server) — to check `can(profile, key)` (future)
 *
 * Storage:
 *   - Defaults live here (hard-coded — single source of truth)
 *   - Overrides live in `role_permissions` table per clinic
 * ============================================================ */

export type StaffRole =
    | "owner" | "admin"
    | "doctor" | "dentist" | "nurse" | "pharmacist" | "physio"
    | "receptionist" | "accountant";

export interface PermissionItem { key: string; label: string; }
export interface PermissionGroup { id: string; label: string; permissions: PermissionItem[]; }

/* ─── Catalog (UI grouping for editor) ─── */
export const PERMISSION_GROUPS: PermissionGroup[] = [
    {
        id: "patients",
        label: "ผู้ป่วย (Patients)",
        permissions: [
            { key: "patients.view", label: "ดูรายชื่อผู้ป่วย" },
            { key: "patients.create", label: "เพิ่มผู้ป่วยใหม่" },
            { key: "patients.edit", label: "แก้ไขข้อมูลผู้ป่วย" },
            { key: "patients.delete", label: "ลบผู้ป่วย" },
        ],
    },
    {
        id: "visits",
        label: "การตรวจ (Visits)",
        permissions: [
            { key: "visits.view", label: "ดูประวัติการตรวจ" },
            { key: "visits.create", label: "ลงทะเบียนการตรวจ" },
            { key: "visits.edit", label: "บันทึก SOAP / Vital signs" },
        ],
    },
    {
        id: "appointments",
        label: "นัดหมาย (Appointments)",
        permissions: [
            { key: "appointments.view", label: "ดูนัดหมาย" },
            { key: "appointments.create", label: "สร้างนัดหมาย" },
            { key: "appointments.edit", label: "แก้ไข/ยกเลิกนัด" },
        ],
    },
    {
        id: "pharmacy",
        label: "ห้องยา (Pharmacy)",
        permissions: [
            { key: "pharmacy.view", label: "ดูคิวจ่ายยา" },
            { key: "pharmacy.dispense", label: "จ่ายยา" },
        ],
    },
    {
        id: "lab",
        label: "ห้องแล็บ (Lab)",
        permissions: [
            { key: "lab.view", label: "ดูคำสั่งแล็บ" },
            { key: "lab.order", label: "สั่งแล็บ" },
            { key: "lab.result", label: "บันทึกผลแล็บ" },
        ],
    },
    {
        id: "anon",
        label: "คลินิกนิรนาม (Anonymous)",
        permissions: [
            { key: "anon.view", label: "เปิดเคส/คัดกรอง Vital signs" },
            { key: "anon.clinical", label: "ดูข้อมูลความเสี่ยง/สั่งตรวจ (แพทย์)" },
            { key: "anon.manage", label: "ลงทะเบียน/รับเงิน/ให้คำปรึกษา" },
            { key: "anon.result", label: "บันทึกผลตรวจ" },
        ],
    },
    {
        id: "finance",
        label: "การเงิน (Finance)",
        permissions: [
            { key: "finance.view", label: "ดูใบเสร็จ/รายรับ" },
            { key: "finance.collect", label: "รับชำระเงิน" },
            { key: "finance.refund", label: "คืนเงิน" },
            { key: "finance.eod", label: "ปิดยอดประจำวัน" },
            { key: "finance.commission", label: "จัดการค่าคอม/จ่ายเซลล์ (ปิดยอด/จ่าย/โอนสิทธิ์)" },
        ],
    },
    {
        id: "pre_order",
        label: "พรีออเดอร์ (Pre-Order)",
        permissions: [
            { key: "pre_order.view", label: "ดูพรีออเดอร์" },
            { key: "pre_order.manage", label: "สร้าง/แก้/รับมัดจำ/ยกเลิก/เช็คอิน" },
            { key: "pre_order.decide", label: "แพทย์ตัดสินรายการ (Doctor Gate)" },
            { key: "pre_order.extend", label: "ขยายอายุมัดจำ (ผู้จัดการ)" },
            { key: "pre_order.settings", label: "ตั้งค่าพรีออเดอร์" },
        ],
    },
    {
        id: "inventory",
        label: "คลังสินค้า (Inventory)",
        permissions: [
            { key: "inventory.view", label: "ดูสต๊อก" },
            { key: "inventory.edit", label: "เพิ่ม/แก้ไขสต๊อก" },
        ],
    },
    {
        id: "reports",
        label: "รายงาน (Reports)",
        permissions: [
            { key: "reports.view", label: "ดูรายงาน" },
            { key: "reports.export", label: "Export รายงาน" },
        ],
    },
    {
        id: "admin",
        label: "การจัดการ (Admin)",
        permissions: [
            { key: "staff.manage", label: "จัดการพนักงาน" },
            { key: "branches.manage", label: "จัดการสาขา" },
            { key: "rooms.manage", label: "จัดการห้องตรวจ" },
            { key: "settings.edit", label: "ตั้งค่าระบบ" },
        ],
    },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap(
    (g) => g.permissions.map((p) => p.key)
);

/* ─── Defaults per role (used when no override in role_permissions) ─── */
export const DEFAULT_PERMISSIONS: Record<StaffRole, string[]> = {
    owner: ALL_PERMISSION_KEYS,
    admin: ALL_PERMISSION_KEYS,

    doctor: [
        "patients.view", "patients.create", "patients.edit",
        "visits.view", "visits.create", "visits.edit",
        "appointments.view", "appointments.create", "appointments.edit",
        "pharmacy.view",
        "lab.view", "lab.order", "lab.result",
        "anon.view", "anon.clinical", "anon.result",
        "pre_order.view", "pre_order.decide",
        "reports.view",
    ],

    dentist: [
        "patients.view", "patients.create", "patients.edit",
        "visits.view", "visits.create", "visits.edit",
        "appointments.view", "appointments.create", "appointments.edit",
        "pharmacy.view",
        "lab.view", "lab.order", "lab.result",
        "reports.view",
    ],

    nurse: [
        "patients.view", "patients.create", "patients.edit",
        "visits.view", "visits.create", "visits.edit",
        "appointments.view", "appointments.create",
        "pharmacy.view",
        "lab.view",
        "anon.view", "anon.manage", "anon.result",
        "pre_order.view", "pre_order.manage",
    ],

    pharmacist: [
        "patients.view",
        "visits.view",
        "pharmacy.view", "pharmacy.dispense",
        "inventory.view", "inventory.edit",
    ],

    physio: [
        "patients.view", "patients.edit",
        "visits.view", "visits.create", "visits.edit",
        "appointments.view", "appointments.create",
    ],

    receptionist: [
        "patients.view", "patients.create", "patients.edit",
        "visits.view", "visits.create",
        "appointments.view", "appointments.create", "appointments.edit",
        "finance.view", "finance.collect",
        "anon.view", "anon.manage",
        "pre_order.view", "pre_order.manage",
    ],

    accountant: [
        "patients.view",
        "visits.view",
        "finance.view", "finance.collect", "finance.refund", "finance.eod", "finance.commission",
        "pre_order.view",
        "reports.view", "reports.export",
    ],
};

export function isDefaultAllowed(role: StaffRole, key: string): boolean {
    return DEFAULT_PERMISSIONS[role]?.includes(key) ?? false;
}

/* ─── Merge defaults + DB overrides into effective permissions ─── */
export function effectivePermissions(
    role: StaffRole,
    overrides: { permission_key: string; is_allowed: boolean }[]
): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const k of ALL_PERMISSION_KEYS) result[k] = isDefaultAllowed(role, k);
    for (const o of overrides) result[o.permission_key] = o.is_allowed;
    return result;
}
