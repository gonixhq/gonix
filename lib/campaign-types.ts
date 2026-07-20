/**
 * Types ของโมดูลแคมเปญ/ส่วนลด — แยกจากไฟล์ "use server"
 * (Next.js บังคับให้ไฟล์ "use server" export เฉพาะ async function)
 */

export type DiscountKind = "campaign" | "manual" | "package" | "staff_benefit";

export const DISCOUNT_KIND_LABEL: Record<DiscountKind | "unclassified", string> = {
    campaign: "แคมเปญ/โค้ดโปรฯ",
    manual: "ลดเอง (พนักงาน)",
    package: "ส่วนลดคอส",
    staff_benefit: "สวัสดิการพนักงาน",
    unclassified: "ไม่ระบุที่มา (บิลเก่า/ไม่ได้บันทึกเหตุผล)",
};

export interface Campaign {
    id: string;
    clinic_id: string;
    code: string;
    name: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    max_discount_amount: number | null;
    min_purchase: number;
    applies_to: "all" | "service" | "drug" | "package" | "lab";
    channel: string | null;
    starts_at: string | null;
    ends_at: string | null;
    usage_limit: number | null;
    usage_limit_per_patient: number;
    is_active: boolean;
    created_at: string;
}

/** รายการในบิลที่ส่งไปให้ server ตรวจเงื่อนไขโค้ด */
export interface DiscountLineInput {
    item_type: string;
    line_total: number;
}

/** ส่วนลดหนึ่งก้อนที่จะบันทึกลง invoice_discounts */
export interface DiscountEntry {
    inv_item_index?: number | null;   // index ใน items[] (null = ท้ายบิล)
    discount_type: DiscountKind;
    discount_source?: string | null;
    campaign_id?: string | null;
    amount: number;
}

export const APPLIES_TO_LABEL: Record<string, string> = {
    all: "ทั้งบิล",
    service: "เฉพาะบริการ",
    drug: "เฉพาะยา/เวชภัณฑ์",
    package: "เฉพาะคอส",
    lab: "เฉพาะแล็บ",
};

export const CAMPAIGN_CHANNELS = [
    { v: "line_oa", l: "LINE OA" },
    { v: "tiktok", l: "TikTok" },
    { v: "facebook", l: "Facebook" },
    { v: "instagram", l: "Instagram" },
    { v: "walk_in", l: "หน้าร้าน" },
    { v: "referral", l: "บอกต่อ" },
    { v: "other", l: "อื่นๆ" },
];
