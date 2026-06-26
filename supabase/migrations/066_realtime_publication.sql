-- ════════════════════════════════════════════════════════════
-- 066: เปิด Supabase Realtime ให้ตารางคิว/นัด/เซสชันห้อง
-- ════════════════════════════════════════════════════════════
-- หน้า Dashboard subscribe การเปลี่ยนแปลงของตารางเหล่านี้ → refresh ทันที
-- (event-driven แทนการ poll อย่างเดียว) ปลอดภัยถ้าตารางอยู่ใน publication แล้ว
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE visits;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE room_doctor_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
