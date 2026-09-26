// ค่าคงที่ฝั่ง client/server สำหรับค่าธรรมเนียมบัตร (สเปกการเงิน เฟส 1)
// ตัวเลขอัตราไม่ได้อยู่ที่นี่ — อยู่ใน finance_rates ต่อคลินิก (ตั้งค่าได้ + วันเริ่มใช้)

export type CardType = "debit_domestic" | "credit_domestic" | "credit_domestic_premium" | "foreign" | "foreign_premium";
export type CardIssuer = "kbank" | "other";

export const CARD_TYPES: { value: CardType; label: string; rateKey: string }[] = [
    { value: "debit_domestic", label: "เดบิต / ATM ในประเทศ", rateKey: "mdr_debit_domestic" },
    { value: "credit_domestic", label: "เครดิตในประเทศ (ทั่วไป)", rateKey: "mdr_credit_domestic" },
    { value: "credit_domestic_premium", label: "เครดิตในประเทศ Premium", rateKey: "mdr_credit_domestic_premium" },
    { value: "foreign", label: "บัตรต่างประเทศ (ทั่วไป)", rateKey: "mdr_foreign" },
    { value: "foreign_premium", label: "บัตรต่างประเทศ Premium", rateKey: "mdr_foreign_premium" },
];

export const CARD_TYPE_LABEL: Record<string, string> = {
    ...Object.fromEntries(CARD_TYPES.map((c) => [c.value, c.label])),
    unspecified: "ไม่ระบุประเภท (บิลเก่า)",
};

export const INSTALLMENT_OPTIONS = [3, 6, 10] as const;

export type RateMeta = { key: string; label: string; unit: "%" | "flag"; group: "mdr" | "card" | "tax"; hint?: string };

// รายการอัตราที่หน้าตั้งค่าแสดง — เฟสถัดไปเพิ่ม key ต่อท้ายได้
export const RATE_META: RateMeta[] = [
    { key: "mdr_debit_domestic", label: "เดบิต / ATM ในประเทศ", unit: "%", group: "mdr" },
    { key: "mdr_credit_domestic", label: "เครดิตในประเทศ (Non-Premium)", unit: "%", group: "mdr", hint: "ใช้กับบิลเก่าที่ไม่ระบุประเภทบัตรด้วย" },
    { key: "mdr_credit_domestic_premium", label: "เครดิตในประเทศ Premium", unit: "%", group: "mdr" },
    { key: "mdr_foreign", label: "ต่างประเทศ (Non-Premium)", unit: "%", group: "mdr" },
    { key: "mdr_foreign_premium", label: "ต่างประเทศ Premium", unit: "%", group: "mdr" },
    { key: "mdr_kbank", label: "บัตรกสิกรไทย (ทุกประเภท)", unit: "%", group: "mdr", hint: "ธนาคารผู้ออก = กสิกร ใช้อัตรานี้ก่อนเสมอ" },
    { key: "card_fee_vat_pct", label: "VAT ของค่าธรรมเนียมบัตร", unit: "%", group: "card", hint: "คลินิกยกเว้น VAT → ขอคืนไม่ได้ นับเป็นต้นทุน" },
    { key: "installment_interest_pct_month", label: "ดอกเบี้ยผ่อนบัตรกสิกร (ต่อเดือน)", unit: "%", group: "card", hint: "ลูกค้าเป็นผู้จ่าย — บันทึกเพื่อรายงานเท่านั้น" },
    { key: "vat_enabled", label: "คลินิกจด VAT", unit: "flag", group: "tax", hint: "เปิด = VAT ค่าธรรมเนียมบัตรขอคืนได้ ไม่นับเป็นต้นทุน" },
];

/** ต้นทุนค่าธรรมเนียมจริงของแถว payment (VAT นับเป็นต้นทุนเมื่อคลินิกไม่จด VAT) */
export function cardFeeCost(fee: number | null | undefined, vat: number | null | undefined, vatEnabled: boolean): number {
    const f = Number(fee || 0), v = Number(vat || 0);
    return Math.round((vatEnabled ? f : f + v) * 100) / 100;
}
