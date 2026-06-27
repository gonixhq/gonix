-- ════════════════════════════════════════════════════════════
-- 083: แก้ affiliate_payouts.paid_at ให้ null ได้ (รองรับสถานะ 'closed')
-- ════════════════════════════════════════════════════════════
-- เดิม (mig 073) paid_at NOT NULL DEFAULT now() — เหมาะกับ model เก่าที่
-- "มีแถว = จ่ายแล้ว" เท่านั้น
-- M12 เพิ่มสถานะ 'closed' (ปิดยอด รอจ่าย) ที่ยังไม่มีวันจ่าย →
--   - แถว closed ควรมี paid_at = NULL (ไม่ใช่เวลาปิด)
--   - การยกเลิกการจ่าย (paid → closed) ต้อง set paid_at = NULL ได้
-- ════════════════════════════════════════════════════════════

ALTER TABLE affiliate_payouts ALTER COLUMN paid_at DROP NOT NULL;
ALTER TABLE affiliate_payouts ALTER COLUMN paid_at DROP DEFAULT;

-- ล้างข้อมูลเก่าที่อาจถูกตั้ง paid_at โดย default ทั้งที่ยังไม่จ่าย (ถ้ามี)
UPDATE affiliate_payouts SET paid_at = NULL WHERE status = 'closed';
