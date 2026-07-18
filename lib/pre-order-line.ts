/**
 * LINE notifications สำหรับโมดูลพรีออเดอร์ → ส่งหาคนไข้ (patients.line_user_id)
 * ทุกฟังก์ชัน best-effort: ไม่มี token / ยังไม่ผูก LINE → ข้ามเงียบ ไม่ throw
 * (ใช้ได้ทั้ง client ปกติและ service-role client ของ cron)
 */
import { pushLineText } from "@/lib/line";

/* eslint-disable @typescript-eslint/no-explicit-any */

const thDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "-";
const baht = (n: number) => `฿${Number(n || 0).toLocaleString("th-TH")}`;

/** ส่งข้อความหาคนไข้ตาม HN (best-effort) */
export async function notifyPatient(supabase: any, hn: string, text: string): Promise<void> {
    try {
        const { data } = await supabase.from("patients").select("line_user_id").eq("hn", hn).maybeSingle();
        const uid = data?.line_user_id as string | null;
        if (!uid) return;
        await pushLineText(uid, text);
    } catch { /* best-effort */ }
}

/** ส่งหลายคนพร้อมกัน (cron) — รับ line_user_id ตรงๆ */
export async function notifyLineUid(uid: string | null | undefined, text: string): Promise<void> {
    if (!uid) return;
    try { await pushLineText(uid, text); } catch { /* best-effort */ }
}

// ── Templates ──
export const PRE_ORDER_MSG = {
    depositReceived: (amount: number, expiresAt: string, receiptNo?: string | null) =>
        `✅ รับมัดจำเรียบร้อย ${baht(amount)}\n` +
        (receiptNo ? `เลขที่ใบรับมัดจำ: ${receiptNo}\n` : "") +
        `มัดจำใช้ได้ถึง ${thDate(expiresAt)}\n\n` +
        `กรุณาเข้ารับบริการภายในวันที่กำหนด หากเลยกำหนดยอดมัดจำจะถูกเก็บเป็นเครดิตในระบบครับ/ค่ะ`,

    scheduled: (when?: string | null) =>
        `📅 ยืนยันนัดหมายเรียบร้อย${when ? `\nวันที่นัด: ${thDate(when)}` : ""}\n\nแล้วพบกันที่คลินิกนะคะ 🙏`,

    expiryWarning: (days: number, expiresAt: string, balance: number) =>
        `⏰ แจ้งเตือน: มัดจำของคุณจะหมดอายุในอีก ${days} วัน (${thDate(expiresAt)})\n` +
        `ยอดมัดจำคงเหลือ ${baht(balance)}\n\n` +
        `กรุณาติดต่อคลินิกเพื่อนัดหมายเข้ารับบริการค่ะ`,

    expiredToCredit: (amount: number) =>
        `หมดอายุการใช้มัดจำแล้ว — ยอด ${baht(amount)} ถูกเก็บเป็น "เครดิต" ในระบบ\n` +
        `สามารถนำมาใช้เป็นส่วนลดในการเข้ารับบริการครั้งถัดไปได้ค่ะ`,

    expiredForfeited: (amount: number) =>
        `แจ้งให้ทราบ: มัดจำ ${baht(amount)} หมดอายุตามเงื่อนไขที่ตกลงไว้แล้วค่ะ\nหากมีข้อสงสัยกรุณาติดต่อคลินิก`,

    cancelled: (resolution?: string | null) =>
        `พรีออเดอร์ของคุณถูกยกเลิกแล้ว` +
        (resolution === "refund_request" ? `\nคำขอคืนเงินอยู่ระหว่างดำเนินการ ทางคลินิกจะติดต่อกลับค่ะ`
            : resolution === "convert_to_credit" ? `\nยอดมัดจำถูกเก็บเป็นเครดิตสำหรับใช้ครั้งถัดไปค่ะ` : ""),

    completed: (total: number, applied: number, paidExtra: number, invId: string) =>
        `🧾 ใบเสร็จ ${invId}\nยอดรวม ${baht(total)}\n` +
        (applied > 0 ? `หักมัดจำ ${baht(applied)}\n` : "") +
        (paidExtra > 0 ? `ชำระเพิ่ม ${baht(paidExtra)}\n` : "") +
        `\nขอบคุณที่ใช้บริการค่ะ 🙏`,
};
