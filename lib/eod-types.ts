/**
 * Shared types + constants for End-of-Day system.
 * Separated from end-of-day.ts because "use server" files can only export async functions.
 */

export interface EODSummary {
    close_date: string;
    total_visits: number;
    visits_by_status: Record<string, number>;
    total_revenue: number;
    anon_count: number;       // จำนวนเคสนิรนามที่จ่ายเงินวันนั้น
    anon_revenue: number;     // ยอดรายรับจากคลินิกนิรนามวันนั้น
    // ── กระทบเงินสด / สรุปช่องทาง (live) ──
    cash_received: number;    // รับเงินสดระหว่างวัน (รวมนิรนาม)
    petty_total: number;      // รายจ่ายย่อย (เงินสด)
    transfer_total: number;   // ยอดโอนรวม
    transfer_count: number;   // จำนวนรายการโอน
    credit_total: number;     // ยอดบัตรเครดิตรวม
    credit_count: number;     // จำนวนรายการบัตร
    last_starting_float: number;  // เงินทอนตั้งต้นครั้งล่าสุด (pre-fill)
    opening_float: number | null; // เงินทอนตั้งต้นที่ตั้งไว้ตอนเช้าของวันนี้ (null = ยังไม่ตั้ง)
    opening_float_by: string | null; // ใครตั้ง
    closed_recon?: {          // ค่าที่บันทึกไว้ (เมื่อปิดยอดแล้ว)
        starting_float: number;
        expected_cash: number;
        actual_cash: number | null;
        over_short: number;
        recon_note: string | null;
        transfer_actual: number | null;
        credit_actual: number | null;
    };
    pending_visits: PendingVisit[];
    queue_last_number: number;
    vn_last_number: number;
    already_closed: boolean;
    closed_record?: {
        id: string;
        closed_at: string;
        closed_by_name: string | null;
    };
}

export interface PendingVisit {
    vn: string;
    hn: string;
    patient_name: string;
    status: string;
    visit_time: string | null;
    queue_number: string | null;
}

export interface CloseDayHistory {
    id: string;
    close_date: string;
    closed_at: string;
    closed_by_name: string | null;
    total_visits: number;
    total_visits_completed: number;
    total_visits_cancelled: number;
    total_revenue: number;
    vn_last_number: number | null;
    queue_last_number: number | null;
    notes: string | null;
}

export const STATUS_LABEL: Record<string, string> = {
    waiting: "รอตรวจ",
    triaged: "ซักประวัติแล้ว",
    with_doctor: "อยู่ห้องตรวจ",
    waiting_medicine: "รอรับยา",
    waiting_payment: "รอชำระเงิน",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิก",
};
