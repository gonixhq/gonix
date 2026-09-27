// บิลค้างจ่าย / เจ้าหนี้ (mig 161) — ค่าคงที่ใช้ร่วม client/server

export type BillType = "lab" | "supplier" | "expense";

export const BILL_TYPE_LABEL: Record<BillType, string> = {
    lab: "แล็บภายนอก",
    supplier: "บริษัทยา/เวชภัณฑ์",
    expense: "ค่าใช้จ่ายคลินิก",
};

export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
    { value: "utility", label: "ค่าน้ำ/ไฟ/เน็ต/โทรศัพท์" },
    { value: "rent", label: "ค่าเช่า/ส่วนกลาง" },
    { value: "maintenance", label: "ซ่อมบำรุง/เครื่องมือ" },
    { value: "office", label: "เครื่องเขียน/ของใช้สำนักงาน" },
    { value: "marketing", label: "การตลาด/โฆษณา" },
    { value: "professional", label: "บัญชี/กฎหมาย/ที่ปรึกษา" },
    { value: "license", label: "ใบอนุญาต/ภาษี/ค่าธรรมเนียม" },
    { value: "cleaning", label: "ทำความสะอาด/ขยะติดเชื้อ" },
    { value: "other", label: "อื่นๆ" },
];
export const expenseCategoryLabel = (v: string | null | undefined) => EXPENSE_CATEGORIES.find(c => c.value === v)?.label || "อื่นๆ";

export const PAY_METHODS: { value: string; label: string }[] = [
    { value: "transfer", label: "โอน" },
    { value: "cash", label: "เงินสด" },
    { value: "cheque", label: "เช็ค" },
    { value: "card", label: "บัตรเครดิตบริษัท" },
];
