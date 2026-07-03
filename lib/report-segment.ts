// Business Unit (Medical/Aesthetic) filter — ใช้ visits.service_category
// aesthetic = ความงาม · medical = ที่เหลือทั้งหมด (general_med/แผล/ใบรับรอง/ตรวจสุขภาพ/STD)
// (นิยามเดียวกับ segment-toggle ในหน้า overview)

export type Seg = "all" | "medical" | "aesthetic";

export function isSeg(v: string | undefined): v is Seg {
    return v === "all" || v === "medical" || v === "aesthetic";
}

/** visit.service_category เข้าเงื่อนไข segment ที่เลือกไหม */
export function catMatchesSeg(seg: Seg, cat: string | null | undefined): boolean {
    if (seg === "all") return true;
    const isAes = cat === "aesthetic";
    return seg === "aesthetic" ? isAes : !isAes;
}

export const SEG_LABEL: Record<Seg, string> = {
    all: "ทั้งหมด", medical: "เวชกรรม (Medical)", aesthetic: "ความงาม (Aesthetic)",
};
