/**
 * Visit service category types & labels — shared between server & client.
 * (Cannot live in "use server" file because Next.js requires only async exports.)
 */

export type ServiceCategory =
    | "general_med" | "aesthetic" | "wound_care"
    | "med_cert" | "checkup" | "std_test";

export type TriageLevel = "normal" | "urgent" | "emergency";

export const SERVICE_LABEL: Record<ServiceCategory, string> = {
    general_med: "เวชกรรมทั่วไป",
    aesthetic: "ความงาม / หัตถการ",
    wound_care: "ทำแผล / ล้างแผล",
    med_cert: "ขอใบรับรองแพทย์",
    checkup: "ตรวจสุขภาพ",
    std_test: "ตรวจเลือด STD",
};

export const TRIAGE_LABEL: Record<TriageLevel, string> = {
    normal: "ปกติ",
    urgent: "เร่งด่วน",
    emergency: "ฉุกเฉิน",
};
