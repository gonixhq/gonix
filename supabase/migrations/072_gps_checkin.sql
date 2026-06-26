-- ════════════════════════════════════════════════════════════
-- 072: GPS Check-in — พิกัดคลินิก + รัศมี + เก็บพิกัดตอนตอกบัตร
-- ════════════════════════════════════════════════════════════
-- พนักงานกดเข้า/เลิกงานผ่านเว็บ ระบบเช็คว่าอยู่ในรัศมีจากพิกัดคลินิก
-- ════════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gps_lat      numeric(10,7);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gps_lng      numeric(10,7);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gps_radius_m int DEFAULT 200;
COMMENT ON COLUMN tenants.gps_radius_m IS 'รัศมีที่อนุญาตให้ตอกบัตร (เมตร) จากพิกัดคลินิก';

ALTER TABLE staff_time_logs ADD COLUMN IF NOT EXISTS clock_in_lat  numeric(10,7);
ALTER TABLE staff_time_logs ADD COLUMN IF NOT EXISTS clock_in_lng  numeric(10,7);
ALTER TABLE staff_time_logs ADD COLUMN IF NOT EXISTS clock_out_lat numeric(10,7);
ALTER TABLE staff_time_logs ADD COLUMN IF NOT EXISTS clock_out_lng numeric(10,7);
