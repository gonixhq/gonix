// ยาทิ้ง (เฟส 4B) — ค่าคงที่แยกจากไฟล์ "use server"
export type WasteReason = "mixed_leftover" | "expired" | "damaged" | "other";

export const WASTE_REASONS: { value: WasteReason; label: string }[] = [
    { value: "mixed_leftover", label: "ผสมแล้วใช้ไม่หมด" },
    { value: "expired", label: "หมดอายุ" },
    { value: "damaged", label: "เสียหาย / แตก / ปนเปื้อน" },
    { value: "other", label: "อื่นๆ (ระบุ)" },
];
export const WASTE_REASON_LABEL: Record<string, string> = Object.fromEntries(WASTE_REASONS.map(r => [r.value, r.label]));
