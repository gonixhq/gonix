-- ════════════════════════════════════════════════════════════
-- 029: Add address_moo (หมู่ที่) column to patients & pending_registrations
-- ════════════════════════════════════════════════════════════
-- แยก "หมู่ที่" ออกจาก address_detail เพื่อความเป็นมาตรฐาน

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS address_moo text;

ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS address_moo text;

COMMENT ON COLUMN patients.address_moo IS 'หมู่ที่ (Moo) — ส่วนหนึ่งของที่อยู่';
COMMENT ON COLUMN pending_registrations.address_moo IS 'หมู่ที่ (Moo) — แยกจาก address_detail';
