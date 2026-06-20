-- ────────────────────────────────────────────────────────────
-- Migration 004: Add missing columns to patients table
-- Adds: race, nationality, marital_status, photo_url,
--        emergency_contact_relation, disease_summary,
--        pdpa_consent, review_consent, registered_by
-- ────────────────────────────────────────────────────────────

ALTER TABLE patients ADD COLUMN IF NOT EXISTS race              text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS nationality       text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS marital_status    text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS photo_url         text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relation text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS disease_summary   text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pdpa_consent      bool DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS review_consent    bool DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS registered_by     uuid REFERENCES profiles(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_edited_by    uuid REFERENCES profiles(id);
