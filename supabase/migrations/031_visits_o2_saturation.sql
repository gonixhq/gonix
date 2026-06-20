-- ════════════════════════════════════════════════════════════
-- 031: Add o2_saturation column to visits
-- ════════════════════════════════════════════════════════════
-- ทำให้ visits มี column o2_saturation เหมือนกับ vital_signs
-- เพื่อให้ screening update visits ได้ครบ + doctor display เห็นค่า

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS o2_saturation int CHECK (o2_saturation >= 0 AND o2_saturation <= 100);

COMMENT ON COLUMN visits.o2_saturation IS 'ความอิ่มตัวของออกซิเจน (%) — บันทึกจากหน้า screening';

-- Backfill จาก vital_signs (ใช้ค่าล่าสุด)
UPDATE visits v
   SET o2_saturation = (
     SELECT vs.o2_saturation
       FROM vital_signs vs
      WHERE vs.vn = v.vn
        AND vs.o2_saturation IS NOT NULL
      ORDER BY vs.recorded_at DESC
      LIMIT 1
   )
 WHERE v.o2_saturation IS NULL;
