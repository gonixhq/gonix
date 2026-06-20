-- ════════════════════════════════════════════════════════════
-- 036: Migrate assigned_doctor_ids จาก profile.id → staff.id
-- ════════════════════════════════════════════════════════════
-- ปัญหา: rooms ที่ save ก่อน migration 035 อาจมี assigned_doctor_ids
--        เป็น profile.id (fallback) เพราะตอนนั้น staff record ยังไม่มี
--        ทำให้ chip "หมอประจำ" ไม่แสดงชื่อ
--
-- แก้: map profile.id → staff.id ใน array assigned_doctor_ids
-- ════════════════════════════════════════════════════════════

UPDATE rooms r
   SET assigned_doctor_ids = (
       SELECT COALESCE(array_agg(DISTINCT mapped_id), ARRAY[]::uuid[])
         FROM (
             SELECT
                 CASE
                     -- ถ้า id ตรงกับ staff.id อยู่แล้ว → ใช้ตัวเดิม
                     WHEN EXISTS (SELECT 1 FROM staff WHERE id = orig_id)
                         THEN orig_id
                     -- ถ้า id ตรงกับ profile.id → map เป็น staff.id
                     WHEN EXISTS (SELECT 1 FROM profiles WHERE id = orig_id)
                         THEN (SELECT s.id FROM staff s WHERE s.profile_id = orig_id LIMIT 1)
                     ELSE NULL
                 END AS mapped_id
               FROM unnest(r.assigned_doctor_ids) AS orig_id
         ) mapped
        WHERE mapped_id IS NOT NULL
   )
 WHERE r.assigned_doctor_ids IS NOT NULL
   AND array_length(r.assigned_doctor_ids, 1) > 0;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT r.room_name, r.assigned_doctor_ids,
--          (SELECT array_agg(p.full_name)
--             FROM staff s JOIN profiles p ON p.id = s.profile_id
--            WHERE s.id = ANY(r.assigned_doctor_ids)) AS doctor_names
--     FROM rooms r WHERE array_length(r.assigned_doctor_ids, 1) > 0;
-- ════════════════════════════════════════════════════════════
