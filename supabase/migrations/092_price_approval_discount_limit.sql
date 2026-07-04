-- ════════════════════════════════════════════════════════════
-- 092: Price Approval — เพดานส่วนลด (max_discount) ต่อคอส
-- ════════════════════════════════════════════════════════════
-- ตอน checkout ถ้าส่วนลดที่กดเกินเพดานที่ตั้งไว้ต่อคอส (service_packages.max_discount_pct)
-- → ไม่บล็อกการชำระ แต่ flag คำขออนุมัติว่า "เกินเพดาน" ให้ผู้อนุมัติเห็นชัด
--   discount_ceiling   = ยอดส่วนลดสูงสุดที่ให้ได้โดยไม่ต้องขออนุมัติ (บาท) ของตะกร้านี้
--   over_discount_limit = ส่วนลดจริงเกินเพดานหรือไม่
-- ════════════════════════════════════════════════════════════

ALTER TABLE price_approvals ADD COLUMN IF NOT EXISTS discount_ceiling numeric(12,2);
ALTER TABLE price_approvals ADD COLUMN IF NOT EXISTS over_discount_limit boolean NOT NULL DEFAULT false;
