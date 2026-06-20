-- ════════════════════════════════════════════════════════════
-- 043: เวลาทำงานพนักงาน + ค่าตอบแทนรายชั่วโมง
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - hourly_rate: เรทค่าจ้าง/ชั่วโมง ต่อพนักงาน (ใช้กับทุกตำแหน่ง รวมแพทย์)
--   - staff_time_logs: บันทึกเข้า-ออกงานจริง (clock-in/out) — แหล่ง "ชั่วโมงจริง"
--   - "ชั่วโมงตามแผน" ใช้จากตาราง doctor_shifts (ขยายให้ลงได้ทุกตำแหน่ง)
--   - ค่าตอบแทน = ชั่วโมง × hourly_rate (+ DF เดิม รวมยอดในหน้าค่าตอบแทน)
-- ════════════════════════════════════════════════════════════

-- ── เรทรายชั่วโมงต่อพนักงาน ──
ALTER TABLE staff
    ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2) DEFAULT 0;

COMMENT ON COLUMN staff.hourly_rate IS 'ค่าจ้างต่อชั่วโมง (บาท) — ใช้คำนวณค่าตอบแทนตามเวลาทำงาน';

-- ── บันทึกเวลาเข้า-ออกงานจริง ──
CREATE TABLE IF NOT EXISTS staff_time_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    work_date   date NOT NULL,
    clock_in    timestamptz NOT NULL,
    clock_out   timestamptz,
    source      text NOT NULL DEFAULT 'manual',   -- 'clock' (ตอกบัตรเอง) | 'manual' (แอดมินกรอก)
    note        text,
    created_by  uuid REFERENCES profiles(id),
    created_at  timestamptz DEFAULT now(),
    CONSTRAINT staff_time_logs_out_chk CHECK (clock_out IS NULL OR clock_out > clock_in)
);

CREATE INDEX IF NOT EXISTS idx_time_logs_clinic_date ON staff_time_logs (clinic_id, work_date);
CREATE INDEX IF NOT EXISTS idx_time_logs_staff_date  ON staff_time_logs (staff_id, work_date);
-- 1 พนักงานเปิดงานค้างไว้ได้แค่รายการเดียว (clock_out ยังว่าง)
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_logs_one_open
    ON staff_time_logs (staff_id) WHERE clock_out IS NULL;

COMMENT ON TABLE staff_time_logs IS 'บันทึกเวลาเข้า-ออกงานจริงของพนักงาน (ชั่วโมงจริงสำหรับคิดค่าตอบแทน)';

ALTER TABLE staff_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_logs_select ON staff_time_logs;
CREATE POLICY time_logs_select ON staff_time_logs
    FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS time_logs_insert ON staff_time_logs;
CREATE POLICY time_logs_insert ON staff_time_logs
    FOR INSERT WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS time_logs_update ON staff_time_logs;
CREATE POLICY time_logs_update ON staff_time_logs
    FOR UPDATE USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS time_logs_delete ON staff_time_logs;
CREATE POLICY time_logs_delete ON staff_time_logs
    FOR DELETE USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT s.id, p.full_name, s.hourly_rate FROM staff s JOIN profiles p ON p.id = s.profile_id;
--   SELECT * FROM staff_time_logs ORDER BY work_date DESC;
-- ════════════════════════════════════════════════════════════
