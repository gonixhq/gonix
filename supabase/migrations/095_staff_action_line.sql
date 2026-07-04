-- ════════════════════════════════════════════════════════════
-- 095: เพิ่ม action ผูก/ยกเลิก LINE ของพนักงาน ใน enum staff_action
-- ════════════════════════════════════════════════════════════
-- ใช้กับ audit log ตอน admin กรอก/ลบ LINE userId ของพนักงาน (แจ้งเตือนตารางเวร)
-- ════════════════════════════════════════════════════════════

ALTER TYPE staff_action ADD VALUE IF NOT EXISTS 'line_link';
ALTER TYPE staff_action ADD VALUE IF NOT EXISTS 'line_unlink';
