// ประเภทใบรับรองแพทย์ (ใช้ร่วม: คัดกรอง, visits/new, Doctor Workspace, PDF)
// แต่ละประเภทจะมีฟอร์ม PDF ที่ต่างกัน (ทยอยทำเพิ่ม)
export const MED_CERT_TYPES = [
    { value: "treatment", label: "เอกสารแพทย์ (มาตรวจรักษาจริง)", en: "Medical Certificate (Treatment)" },
    { value: "sick_leave", label: "ใบรับรองแพทย์ — ลาป่วย", en: "Medical Certificate for Sick Leave" },
    { value: "cannabis", label: "ใบสั่งจ่ายสมุนไพรควบคุม กัญชา (ภ.ท.๓๓)", en: "Controlled Herb (Cannabis) Prescription — ภ.ท.33" },
    { value: "health_check", label: "ใบตรวจสุขภาพ (สมัครงาน/เรียน)", en: "Health Examination (Job/Study)" },
    { value: "driving", label: "ใบรับรองแพทย์ — ใบขับขี่", en: "Medical Certificate for Driving License" },
] as const;

export type MedCertType = typeof MED_CERT_TYPES[number]["value"];

export const MED_CERT_LABEL: Record<string, string> = Object.fromEntries(
    MED_CERT_TYPES.map((t) => [t.value, t.label])
);
