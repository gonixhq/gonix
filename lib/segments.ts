/** แผนกรายได้ (Revenue Segmentation) — medical / aesthetic / product */
export type Segment = "medical" | "aesthetic" | "product";

export const SEGMENTS: { key: Segment; label: string; labelEn: string }[] = [
    { key: "medical", label: "การแพทย์", labelEn: "Medical" },
    { key: "aesthetic", label: "ความงาม", labelEn: "Aesthetic" },
    { key: "product", label: "ขายของ", labelEn: "Product" },
];

export const SEGMENT_LABEL: Record<string, string> = {
    medical: "การแพทย์",
    aesthetic: "ความงาม",
    product: "ขายของ",
};

/** สี (tailwind) ต่อแผนก — ใช้กับ badge/แท่งสัดส่วน */
export const SEGMENT_STYLE: Record<Segment, { text: string; bg: string; bar: string }> = {
    medical: { text: "text-blue-700", bg: "bg-blue-100", bar: "bg-blue-500" },
    aesthetic: { text: "text-rose-700", bg: "bg-rose-100", bar: "bg-rose-500" },
    product: { text: "text-amber-700", bg: "bg-amber-100", bar: "bg-amber-500" },
};

/** เดาแผนกจากประเภทรายการ เมื่อยังไม่ได้ติดแท็ก (fallback) */
export function fallbackSegment(itemType: string): Segment {
    if (itemType === "drug" || itemType === "supply") return "product";
    if (itemType === "doctor_fee" || itemType === "lab") return "medical";
    return "medical"; // procedure / service / package / other → การแพทย์ (ปรับด้วยการติดแท็ก)
}
