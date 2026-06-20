-- ============================================================
-- 010_simplified_doctor_inputs.sql
-- Description: Adds physical_exam and doctor_note columns to 
-- visits table to support the simplified Doctor Station UI.
-- ============================================================

ALTER TABLE visits
ADD COLUMN IF NOT EXISTS physical_exam text,
ADD COLUMN IF NOT EXISTS doctor_note text;
