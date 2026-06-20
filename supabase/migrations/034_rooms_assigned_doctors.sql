-- ════════════════════════════════════════════════════════════
-- 034: เพิ่ม assigned_doctor_ids ในห้องตรวจ
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - 1 ห้อง สามารถมีหมอประจำได้หลายคน (many-to-many)
--   - ไม่ block — หมอนอกรายชื่อยัง check-in ห้องนี้ได้
--   - ใช้สำหรับแสดงข้อมูล + filter ใน UI
-- ════════════════════════════════════════════════════════════

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS assigned_doctor_ids uuid[] DEFAULT ARRAY[]::uuid[];

COMMENT ON COLUMN rooms.assigned_doctor_ids IS 'staff.id ของแพทย์ที่ประจำห้องนี้ (informational — ไม่ block หมอนอกรายชื่อ)';

CREATE INDEX IF NOT EXISTS idx_rooms_assigned_doctors
  ON rooms USING gin(assigned_doctor_ids);

-- ── Update v_room_current_status ให้รวม assigned doctors ──
DROP VIEW IF EXISTS v_room_current_status;

CREATE VIEW v_room_current_status AS
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
    r.assigned_doctor_ids,
    -- ดึงชื่อหมอประจำ (jsonb array)
    COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'staff_id', sa.id,
            'name', pa.full_name,
            'role', pa.role
        ) ORDER BY pa.full_name)
          FROM staff sa
          JOIN profiles pa ON pa.id = sa.profile_id
         WHERE sa.id = ANY(r.assigned_doctor_ids)
    ), '[]'::jsonb) AS assigned_doctors,
    -- Active session
    s.id            AS active_session_id,
    s.checked_in_at AS session_started_at,
    s.doctor_staff_id,
    sf.profile_id   AS doctor_profile_id,
    p.full_name     AS doctor_name,
    p.role          AS doctor_role,
    sf.specialties  AS doctor_specialties,
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

COMMENT ON VIEW v_room_current_status IS 'สถานะห้อง + หมอประจำ + active session + waiting count';

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT room_name, assigned_doctors FROM v_room_current_status;
-- ════════════════════════════════════════════════════════════
