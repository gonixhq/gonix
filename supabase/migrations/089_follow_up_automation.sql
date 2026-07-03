-- ════════════════════════════════════════════════════════════
-- 089: Follow-up เฟส3 Automation — ธงกัน cron ทำซ้ำ + self-report
-- ════════════════════════════════════════════════════════════

-- auto_sent_at: ส่งข้อความติดตามอัตโนมัติทาง LINE แล้วเมื่อไหร่ (กันส่งซ้ำ)
ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS auto_sent_at timestamptz;
-- fallback_at: แจ้งเตือน fallback (owner/หมอเวร) แล้วเมื่อไหร่ (กันแจ้งซ้ำ)
ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS fallback_at  timestamptz;
-- self_reported: เคสที่คนไข้รายงานอาการเองผ่าน LINE
ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS self_reported boolean NOT NULL DEFAULT false;
