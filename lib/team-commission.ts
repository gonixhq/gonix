// คอมทีม (เฟส 2E) — ตำแหน่ง + น้ำหนัก (น้ำหนักจริงอยู่ใน finance_rates team_w_* แก้ได้ที่หน้าอัตราการเงิน)
export type TeamPosition = "nurse" | "marketing" | "assistant" | "front" | "general" | "excluded";
export type TeamTier = { min: number; pct: number };

export const TEAM_POSITIONS: { value: TeamPosition; label: string; rateKey?: string; defaultWeight: number }[] = [
    { value: "nurse", label: "พยาบาลวิชาชีพ", rateKey: "team_w_nurse", defaultWeight: 2 },
    { value: "marketing", label: "การตลาด", rateKey: "team_w_marketing", defaultWeight: 2 },
    { value: "assistant", label: "ผู้ช่วยพยาบาล", rateKey: "team_w_assistant", defaultWeight: 1 },
    { value: "front", label: "ต้อนรับ / ธุรการ", rateKey: "team_w_front", defaultWeight: 1 },
    { value: "general", label: "แม่บ้าน / ทั่วไป", rateKey: "team_w_general", defaultWeight: 0.5 },
    { value: "excluded", label: "กรรมการ / ผู้ถือหุ้น (ไม่รับ)", defaultWeight: 0 },
];
export const TEAM_POSITION_LABEL: Record<string, string> = Object.fromEntries(TEAM_POSITIONS.map(p => [p.value, p.label]));
