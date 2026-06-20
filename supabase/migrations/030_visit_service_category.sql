-- ════════════════════════════════════════════════════════════
-- 030: Visit Service Category
-- ════════════════════════════════════════════════════════════
-- เพิ่มประเภทบริการของ visit
-- - general_med  : เวชกรรมทั่วไป
-- - aesthetic    : ความงาม / หัตถการ
-- - wound_care   : ทำแผล / ล้างแผล
-- - med_cert     : ขอใบรับรองแพทย์
-- - checkup      : ตรวจสุขภาพ
-- - std_test     : ตรวจเลือด STD

DO $$ BEGIN
  CREATE TYPE service_category AS ENUM (
    'general_med',
    'aesthetic',
    'wound_care',
    'med_cert',
    'checkup',
    'std_test'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS service_category service_category DEFAULT 'general_med';

CREATE INDEX IF NOT EXISTS idx_visits_service_category
  ON visits(clinic_id, visit_date, service_category);

-- เพิ่ม pain_score column (ใช้ใน screening)
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS pain_score int CHECK (pain_score >= 0 AND pain_score <= 10);

COMMENT ON COLUMN visits.service_category IS 'ประเภทบริการ: เวชกรรม/ความงาม/ทำแผล/ใบรับรอง/ตรวจสุขภาพ/ตรวจ STD';
COMMENT ON COLUMN visits.pain_score IS 'คะแนนความเจ็บปวด 0-10 (NRS Pain Score)';
