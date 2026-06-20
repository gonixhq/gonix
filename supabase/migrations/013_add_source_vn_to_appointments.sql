-- ============================================================
-- 013_add_source_vn_to_appointments.sql
-- Adds source_vn to appointments table to link it back to the
-- visit where it was booked.
-- ============================================================

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS source_vn text REFERENCES visits(vn);

CREATE INDEX IF NOT EXISTS idx_appt_source_vn ON appointments(source_vn);

-- ============================================================
-- End of 013_add_source_vn_to_appointments.sql
-- ============================================================
