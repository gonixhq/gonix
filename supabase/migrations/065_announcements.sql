-- ════════════════════════════════════════════════════════════
-- 065: Announcement board — กล่องประกาศปักหมุดบนหน้า Dashboard
-- ════════════════════════════════════════════════════════════
-- ผู้จัดการพิมพ์ข้อความแจ้งพนักงานทุกกะ (เครื่องเสีย/โปรโมชัน ฯลฯ)
-- ไม่ใช้ RLS — กรองด้วย clinic_id ในแอป (ตามแนวทาง mig 061/062)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcements (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    message     text NOT NULL,
    level       text NOT NULL DEFAULT 'info',   -- info | warning | urgent
    created_by  uuid REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  date,                            -- ถ้าตั้ง จะซ่อนอัตโนมัติเมื่อพ้นวันนั้น
    is_active   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_announcements_clinic_active
    ON announcements (clinic_id, is_active);
