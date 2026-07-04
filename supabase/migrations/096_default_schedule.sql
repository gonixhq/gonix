-- ════════════════════════════════════════════════════════════
-- 096: Default Schedule (เวรมาตรฐานต่อคน) + source ของเวร
-- ════════════════════════════════════════════════════════════
-- staff_default_schedule: แพทเทิร์นเวรถาวรต่อพนักงาน (จ–อา) — apply เข้าเดือนได้
-- doctor_shifts.source: 'manual' (เพิ่มเอง) | 'recurring' (จาก repeat/default) → badge "ประจำ"
-- ════════════════════════════════════════════════════════════

ALTER TABLE doctor_shifts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS staff_default_schedule (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    weekday     int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0=อา … 6=ส (JS getDay)
    start_time  time NOT NULL,
    end_time    time NOT NULL,
    room_id     uuid REFERENCES rooms(id) ON DELETE SET NULL,
    updated_by  uuid REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_default_time_chk CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_staff_default_clinic ON staff_default_schedule (clinic_id, staff_id);

ALTER TABLE staff_default_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_default_schedule_clinic ON staff_default_schedule;
CREATE POLICY staff_default_schedule_clinic ON staff_default_schedule FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
