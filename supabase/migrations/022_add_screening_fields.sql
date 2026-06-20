-- ============================================================
-- 022_add_screening_fields.sql
-- Add fields for Screening Station:
--   - triage_level: severity / urgency (normal/urgent/emergency)
--   - nurse_note  : บันทึกจากพยาบาลถึงหมอ
-- Run AFTER 021_fix_handle_new_user_phone.sql
-- ============================================================

-- ── ENUM ──
DO $$ BEGIN
  CREATE TYPE triage_level AS ENUM ('normal', 'urgent', 'emergency');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Add columns ──
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS triage_level triage_level DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS nurse_note   text;

CREATE INDEX IF NOT EXISTS idx_visits_triage
  ON visits(clinic_id, visit_date, triage_level)
  WHERE triage_level <> 'normal';
