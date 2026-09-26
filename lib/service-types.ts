/**
 * Service catalog types — shared between server & client.
 */

export type ServiceItemType = "doctor_fee" | "procedure" | "service" | "supply" | "lab_external" | "other";

export interface ServiceCatalogItem {
    id: string;
    service_code: string | null;
    service_name: string;
    item_type: ServiceItemType;
    selling_price: number;
    duration_min: number | null;
    note: string | null;
    is_active: boolean;
    inventory_item_id: string | null;   // kit ในคลังที่ตัด stock
    consume_qty: number | null;         // จำนวนที่ตัดต่อครั้ง
    segment?: string | null;            // แผนกรายได้ medical/aesthetic/product
    follow_up_days?: string | null;     // รอบติดตามผล "1,7,14"
    df_doctor?: number | null;          // ค่ามือหมอต่อเคส (บาท หรือ %)
    df_nurse?: number | null;           // ค่ามือพยาบาลต่อเคส
    df_assistant?: number | null;       // ค่ามือผู้ช่วยต่อเคส
    df_mode?: string | null;            // 'baht' | 'percent'
    ref_comm_mode?: string | null;      // คอมแนะนำ: pct | fixed | per_unit | none · null = มาตรฐาน
    ref_comm_value?: number | null;
    team_count_pct?: number | null;     // % นับเข้าคอมทีม (null = 100)
    doctor_hours?: number | null;       // ชั่วโมงแพทย์มาตรฐานต่อเคส (ประเมินต้นทุน)
}

/** สูตรหัตถการ 1 บรรทัด (เฟส 4A) */
export interface RecipeLine {
    inventory_item_id: string;
    qty: number;
}

export interface InventoryPick {
    id: string;
    item_name: string;
    stock_qty: number;
    unit: string | null;
    cost_price?: number;          // ราคาทุนต่อหน่วยใช้
    units_per_pack?: number | null;
    single_use?: boolean;         // ใช้ครั้งเดียวทิ้ง → คิดเต็มแพ็ก
}

/** ต้นทุนการใช้ของ (ตรงกับ fn_inv_use_cost ที่ DB) */
export function invUseCost(p: InventoryPick | undefined, qty: number): number {
    if (!p) return 0;
    const upp = Number(p.units_per_pack || 0);
    const q = p.single_use && upp > 0 ? Math.ceil(qty / upp) * upp : qty;
    return Math.round((p.cost_price || 0) * q * 100) / 100;
}

export const SERVICE_ITEM_TYPE_LABEL: Record<ServiceItemType, string> = {
    doctor_fee: "ค่าตรวจ / แพทย์",
    procedure: "หัตถการ",
    service: "บริการ",
    supply: "วัสดุ",
    lab_external: "แล็บภายนอก",
    other: "อื่นๆ",
};

export const SERVICE_ITEM_TYPE_COLOR: Record<ServiceItemType, string> = {
    doctor_fee: "bg-sky-100 text-sky-700",
    procedure: "bg-rose-100 text-rose-700",
    service: "bg-teal-100 text-teal-700",
    supply: "bg-indigo-100 text-indigo-700",
    lab_external: "bg-purple-100 text-purple-700",
    other: "bg-slate-100 text-slate-700",
};

export const SERVICE_ITEM_TYPE_OPTIONS: { value: ServiceItemType; label: string }[] = [
    { value: "doctor_fee", label: "ค่าตรวจ / แพทย์" },
    { value: "procedure", label: "หัตถการ" },
    { value: "service", label: "บริการ" },
    { value: "supply", label: "วัสดุสิ้นเปลือง" },
    { value: "lab_external", label: "แล็บภายนอก" },
    { value: "other", label: "อื่นๆ" },
];
