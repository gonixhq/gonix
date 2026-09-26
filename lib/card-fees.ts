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

export type RateMeta = { key: string; label: string; unit: "%" | "flag" | "baht" | "month" | "weight"; group: "mdr" | "card" | "tax" | "comp" | "kpi"; hint?: string };

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
    { key: "doctor_hour_rate", label: "ค่าชั่วโมงแพทย์ (บาท/ชม.)", unit: "baht", group: "comp", hint: "คิดจากเวลาเข้า-ออกงานจริง · แพทย์ที่ตั้งเรทรายคนไว้ในหน้าค่าตอบแทนจะใช้เรทรายคนแทน" },
    { key: "df_doctor_pct", label: "DF แพทย์ (% ของยอดสุทธิ)", unit: "%", group: "comp", hint: "เฉพาะรายการที่แพทย์ทำ (เปิดใช้ในเฟส 2B)" },
    { key: "ref_comm_pct", label: "คอมแนะนำ มาตรฐาน (% ของยอดสุทธิ)", unit: "%", group: "comp", hint: "เฉพาะฝั่งความงาม · เมนูที่ตั้งคอมแนะนำเฉพาะ (เช่น ฟิลเลอร์ ฿/cc) จะใช้อัตราของเมนูแทน" },
    { key: "cash_reserve", label: "เงินสำรองของคลินิก (บาท)", unit: "baht", group: "kpi", hint: "ยอดเงินสดในบัญชีสำรอง — อัปเดตเมื่อยอดเปลี่ยน · KPI หน้าแรกคำนวณว่าอยู่ได้กี่เดือน (ควร ≥ 3 เดือนของต้นทุนคงที่)" },
    { key: "margin_threshold_pct", label: "เกณฑ์มาร์จิ้นขั้นต่ำต่อหัตถการ", unit: "%", group: "comp", hint: "หัตถการที่มาร์จิ้นต่ำกว่านี้จะถูกเตือนในรายงานต้นทุนหัตถการ" },
    { key: "team_w_nurse", label: "คอมทีม: น้ำหนัก พยาบาลวิชาชีพ", unit: "weight", group: "comp", hint: "คะแนน = น้ำหนัก × วันมาทำงาน" },
    { key: "team_w_marketing", label: "คอมทีม: น้ำหนัก การตลาด", unit: "weight", group: "comp" },
    { key: "team_w_assistant", label: "คอมทีม: น้ำหนัก ผู้ช่วยพยาบาล", unit: "weight", group: "comp" },
    { key: "team_w_front", label: "คอมทีม: น้ำหนัก ต้อนรับ/ธุรการ", unit: "weight", group: "comp" },
    { key: "team_w_general", label: "คอมทีม: น้ำหนัก แม่บ้าน/ทั่วไป", unit: "weight", group: "comp" },
    { key: "ref_lapse_months", label: "ผู้แนะนำหลุดเมื่อลูกค้าไม่มาเกิน", unit: "month", group: "comp", hint: "หลุดแล้ว พนักงานที่ตามลูกค้ากลับมาลงชื่อใหม่ได้" },
];

/** ต้นทุนค่าธรรมเนียมจริงของแถว payment (VAT นับเป็นต้นทุนเมื่อคลินิกไม่จด VAT) */
export function cardFeeCost(fee: number | null | undefined, vat: number | null | undefined, vatEnabled: boolean): number {
    const f = Number(fee || 0), v = Number(vat || 0);
    return Math.round((vatEnabled ? f : f + v) * 100) / 100;
}
