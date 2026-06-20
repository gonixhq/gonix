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
}

export interface InventoryPick {
    id: string;
    item_name: string;
    stock_qty: number;
    unit: string | null;
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
