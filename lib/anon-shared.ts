// ค่าคงที่ที่ใช้ร่วมทั้งฝั่ง server + client (ไม่ใช่ "use server")
// ชนิดที่ถือเป็น "รายการตรวจ Lab" (มีผล) — นอกนั้นเป็นค่าบริการ/ค่าใช้จ่าย
export const LAB_TYPES = new Set(["lab", "lab_external"]);
export const isLabType = (t?: string | null) => LAB_TYPES.has((t as string) || "");
