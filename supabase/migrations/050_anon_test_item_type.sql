-- ════════════════════════════════════════════════════════════
-- 050: คลินิกนิรนาม — แยกชนิดรายการ (Lab ที่มีผล vs ค่าบริการ)
-- ════════════════════════════════════════════════════════════
-- เก็บ item_type ของแต่ละรายการในเคส (snapshot จาก service_catalog)
--   - lab / lab_external = "รายการตรวจ" → มีช่องกรอกผล
--   - อื่นๆ (doctor_fee/service/procedure/supply...) = "ค่าบริการ" → ไม่มีผล
-- ════════════════════════════════════════════════════════════

ALTER TABLE anon_case_tests
    ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'other';

COMMENT ON COLUMN anon_case_tests.item_type IS 'ชนิดรายการ — lab/lab_external = มีผล, อื่นๆ = ค่าบริการ';
