-- ════════════════════════════════════════════════════════════
-- 042: ตารางเวรแพทย์ (Doctor Shifts) — ลงเวรรายวัน
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - ลงเวรเป็น "รายวัน" (shift_date) — หมอ 1 คนมีได้หลายช่วงต่อวัน (เช้า/บ่าย)
--   - เวร = แผนล่วงหน้า (ต่างจาก room_doctor_sessions ที่เป็น check-in จริง)
--   - ใช้กับ: หน้าจัดการตารางเวร, โชว์หมอเข้าเวรวันนี้, กรอง/เตือนในหน้านัดหมาย
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doctor_shifts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    doctor_staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
    shift_date      date NOT NULL,
    start_time      time NOT NULL,
    end_time        time NOT NULL,
    room_id         uuid REFERENCES rooms(id) ON DELETE SET NULL,
    note            text,
    created_by      uuid REFERENCES profiles(id),
    created_at      timestamptz DEFAULT now(),
    CONSTRAINT doctor_shifts_time_chk CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_doctor_shifts_clinic_date
    ON doctor_shifts (clinic_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_doctor_shifts_doctor_date
    ON doctor_shifts (doctor_staff_id, shift_date);

COMMENT ON TABLE doctor_shifts IS 'เวรแพทย์รายวัน (แผนล่วงหน้า) — 1 หมอมีได้หลายช่วงต่อวัน';
COMMENT ON COLUMN doctor_shifts.shift_date IS 'วันที่เข้าเวร (date เวลาไทย)';

-- ── RLS ──
ALTER TABLE doctor_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_shifts_select ON doctor_shifts;
CREATE POLICY doctor_shifts_select ON doctor_shifts
    FOR SELECT USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS doctor_shifts_insert ON doctor_shifts;
CREATE POLICY doctor_shifts_insert ON doctor_shifts
    FOR INSERT WITH CHECK (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS doctor_shifts_update ON doctor_shifts;
CREATE POLICY doctor_shifts_update ON doctor_shifts
    FOR UPDATE USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS doctor_shifts_delete ON doctor_shifts;
CREATE POLICY doctor_shifts_delete ON doctor_shifts
    FOR DELETE USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT ds.shift_date, p.full_name, ds.start_time, ds.end_time
--     FROM doctor_shifts ds
--     JOIN staff s ON s.id = ds.doctor_staff_id
--     JOIN profiles p ON p.id = s.profile_id
--    ORDER BY ds.shift_date, ds.start_time;
-- ════════════════════════════════════════════════════════════
