-- ════════════════════════════════════════════════════════════
-- 033: ระบบห้องตรวจ + Dynamic Doctor Check-in
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   1. Admin สร้างห้องตรวจ + กำหนดประเภทบริการ
--   2. หมอ login แล้ว check-in เข้าห้องเอง (1 ห้อง = 1 หมอ active session)
--   3. พยาบาลตอน screening → เลือกห้องส่งคนไข้
--   4. Doctor station filter ตามห้องที่หมอ check-in
-- ════════════════════════════════════════════════════════════

-- ── เพิ่ม columns ใน rooms ──
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS service_categories text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS color text DEFAULT 'slate';

-- ── เพิ่ม room_id ใน visits ──
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id);

CREATE INDEX IF NOT EXISTS idx_visits_room_status
  ON visits (room_id, status) WHERE status = 'with_doctor';

COMMENT ON COLUMN visits.room_id IS 'ห้องตรวจที่พยาบาลเลือกส่งคนไข้เข้าไป';

COMMENT ON COLUMN rooms.service_categories IS 'array ของ service_category ที่ห้องนี้รับบริการ (เช่น general_med, aesthetic)';
COMMENT ON COLUMN rooms.color IS 'สีของห้อง สำหรับ visual differentiation: slate, blue, emerald, amber, pink, purple, red';

-- ── ตาราง room_doctor_sessions ──
CREATE TABLE IF NOT EXISTS room_doctor_sessions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    room_id           uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    doctor_staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    checked_in_at     timestamptz NOT NULL DEFAULT now(),
    checked_out_at    timestamptz,
    notes             text
);

-- 1 ห้อง = 1 หมอ active session ณ ขณะหนึ่ง
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_one_active_session
    ON room_doctor_sessions (room_id)
    WHERE checked_out_at IS NULL;

-- 1 หมอ active session ได้แค่ห้องเดียว
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_one_active_session
    ON room_doctor_sessions (doctor_staff_id)
    WHERE checked_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_room_sessions_clinic_active
    ON room_doctor_sessions (clinic_id) WHERE checked_out_at IS NULL;

COMMENT ON TABLE room_doctor_sessions IS 'บันทึก check-in/check-out ของหมอแต่ละห้องตรวจ';

-- ── RLS ──
ALTER TABLE room_doctor_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_sessions_select ON room_doctor_sessions;
CREATE POLICY room_sessions_select ON room_doctor_sessions
    FOR SELECT USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS room_sessions_insert ON room_doctor_sessions;
CREATE POLICY room_sessions_insert ON room_doctor_sessions
    FOR INSERT WITH CHECK (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS room_sessions_update ON room_doctor_sessions;
CREATE POLICY room_sessions_update ON room_doctor_sessions
    FOR UPDATE USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

-- ── fn_room_checkin: หมอเข้าห้อง ──
CREATE OR REPLACE FUNCTION fn_room_checkin(
    p_clinic_id        uuid,
    p_room_id          uuid,
    p_doctor_staff_id  uuid
) RETURNS uuid AS $$
DECLARE
    v_session_id uuid;
    v_existing_room_id uuid;
BEGIN
    -- ── 1. Check out session เดิมของหมอ (ถ้ามี) ──
    UPDATE room_doctor_sessions
       SET checked_out_at = now()
     WHERE doctor_staff_id = p_doctor_staff_id
       AND checked_out_at IS NULL
       AND room_id != p_room_id;

    -- ── 2. Check ว่ามีหมอคนอื่น check-in อยู่ห้องนี้ไหม ──
    SELECT room_id INTO v_existing_room_id
      FROM room_doctor_sessions
     WHERE room_id = p_room_id
       AND checked_out_at IS NULL
       AND doctor_staff_id != p_doctor_staff_id
     LIMIT 1;

    IF v_existing_room_id IS NOT NULL THEN
        RAISE EXCEPTION 'ROOM_OCCUPIED';
    END IF;

    -- ── 3. ถ้าหมอนี้เคย check-in ห้องนี้แล้ว → return id เดิม ──
    SELECT id INTO v_session_id
      FROM room_doctor_sessions
     WHERE room_id = p_room_id
       AND doctor_staff_id = p_doctor_staff_id
       AND checked_out_at IS NULL
     LIMIT 1;

    IF v_session_id IS NOT NULL THEN
        RETURN v_session_id;
    END IF;

    -- ── 4. Insert session ใหม่ ──
    INSERT INTO room_doctor_sessions (clinic_id, room_id, doctor_staff_id)
    VALUES (p_clinic_id, p_room_id, p_doctor_staff_id)
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_room_checkin IS 'หมอ check-in เข้าห้อง — auto check-out ห้องเดิม. Raises ROOM_OCCUPIED ถ้ามีหมอคนอื่นอยู่';

-- ── fn_room_checkout: หมอออกจากห้อง ──
CREATE OR REPLACE FUNCTION fn_room_checkout(
    p_doctor_staff_id uuid
) RETURNS int AS $$
DECLARE
    v_count int;
BEGIN
    UPDATE room_doctor_sessions
       SET checked_out_at = now()
     WHERE doctor_staff_id = p_doctor_staff_id
       AND checked_out_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── View: v_room_current_status ──
-- รวมข้อมูลห้อง + หมอที่ active + จำนวนคิวรอ
CREATE OR REPLACE VIEW v_room_current_status AS
SELECT
    r.id            AS room_id,
    r.clinic_id,
    r.room_name,
    r.room_type,
    r.service_categories,
    r.description,
    r.display_order,
    r.color,
    r.is_active,
    s.id            AS active_session_id,
    s.checked_in_at AS session_started_at,
    s.doctor_staff_id,
    sf.profile_id   AS doctor_profile_id,
    p.full_name     AS doctor_name,
    p.role          AS doctor_role,
    sf.specialties  AS doctor_specialties,
    -- จำนวน visit รอตรวจในห้องนี้
    COALESCE((
        SELECT count(*)::int
          FROM visits v
         WHERE v.room_id = r.id
           AND v.status IN ('with_doctor')
    ), 0) AS waiting_count
  FROM rooms r
  LEFT JOIN room_doctor_sessions s
         ON s.room_id = r.id AND s.checked_out_at IS NULL
  LEFT JOIN staff sf ON sf.id = s.doctor_staff_id
  LEFT JOIN profiles p ON p.id = sf.profile_id
 WHERE r.is_active = true;

COMMENT ON VIEW v_room_current_status IS 'สถานะปัจจุบันของห้องตรวจ + หมอ + จำนวนคิวรอ';

-- ════════════════════════════════════════════════════════════
-- Seed example rooms สำหรับ tanavej (optional — ลบทิ้งได้)
-- ════════════════════════════════════════════════════════════
-- INSERT INTO rooms (clinic_id, room_name, room_type, service_categories, description, display_order, color)
-- SELECT id, 'ห้อง 1 - โรคทั่วไป', 'examination', ARRAY['general_med', 'med_cert'], 'ตรวจโรคทั่วไป', 1, 'blue'
--   FROM tenants WHERE name = 'Tanavej Clinic' LIMIT 1;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT * FROM rooms;
--   SELECT * FROM v_room_current_status;
--   SELECT fn_room_checkin('<clinic_id>', '<room_id>', '<staff_id>');
--   SELECT fn_room_checkout('<staff_id>');
-- ════════════════════════════════════════════════════════════
