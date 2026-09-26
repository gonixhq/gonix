// ต้นทุนคงที่ (เฟส 5A) — ค่าคงที่แยกจากไฟล์ "use server"
export type FixedCostCategory = "place" | "staff" | "accounting" | "license" | "marketing" | "other";

export const FIXED_COST_CATEGORIES: { value: FixedCostCategory; label: string; hint?: string }[] = [
    { value: "place", label: "สถานที่", hint: "ค่าเช่า น้ำไฟ อินเทอร์เน็ต" },
    { value: "staff", label: "พนักงาน", hint: "ค่าใบอนุญาต/สวัสดิการที่ไม่ได้อยู่ในหน้าค่าตอบแทน — เงินเดือนที่คิดในหน้าค่าตอบแทนแล้วไม่ต้องใส่ซ้ำ" },
    { value: "accounting", label: "บัญชี", hint: "ทำบัญชี ตรวจสอบบัญชี" },
    { value: "license", label: "ใบอนุญาต / ขยะติดเชื้อ" },
    { value: "marketing", label: "การตลาด (ประจำ)", hint: "ค่าแอด/การตลาดประจำ — แสดงเป็นบรรทัดการตลาดในรายงาน · ถ้าบันทึกค่าแอดรายช่องทางในหน้า CAC แล้ว ไม่ต้องใส่ซ้ำ" },
    { value: "other", label: "อื่นๆ" },
];
export const FIXED_COST_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(FIXED_COST_CATEGORIES.map(c => [c.value, c.label]));

/** ตัวอย่างจากสเปก (นำเข้าได้ครั้งแรก แล้วแก้ตัวเลขเอง) */
export const FIXED_COST_EXAMPLES: { name: string; category: FixedCostCategory; amount: number; cycle: "monthly" | "yearly"; status: "actual" | "planned" }[] = [
    { name: "ค่าเช่า", category: "place", amount: 12000, cycle: "monthly", status: "actual" },
    { name: "ค่าน้ำ-ไฟ", category: "place", amount: 4000, cycle: "monthly", status: "actual" },
    { name: "อินเทอร์เน็ต", category: "place", amount: 700, cycle: "monthly", status: "actual" },
    { name: "ค่าใบอนุญาตพยาบาล", category: "staff", amount: 2000, cycle: "monthly", status: "actual" },
    { name: "แม่บ้าน", category: "staff", amount: 1500, cycle: "monthly", status: "actual" },
    { name: "ทำบัญชี", category: "accounting", amount: 3500, cycle: "monthly", status: "actual" },
    { name: "ตรวจสอบบัญชี", category: "accounting", amount: 20000, cycle: "yearly", status: "actual" },
    { name: "ต่อใบอนุญาต", category: "license", amount: 1000, cycle: "yearly", status: "actual" },
    { name: "ขยะติดเชื้อ", category: "license", amount: 5500, cycle: "yearly", status: "actual" },
    { name: "ค่าแอด", category: "marketing", amount: 5000, cycle: "monthly", status: "actual" },
    { name: "เงินเดือนกรรมการ", category: "staff", amount: 25000, cycle: "monthly", status: "planned" },
    { name: "ค่าแขวนใบ", category: "staff", amount: 25000, cycle: "monthly", status: "planned" },
];
