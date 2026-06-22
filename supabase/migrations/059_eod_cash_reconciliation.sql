-- ════════════════════════════════════════════════════════════
-- 059: ปิดยอด — เพิ่มข้อมูลกระทบเงินสด (Cash Reconciliation) + สรุปช่องทาง
-- ════════════════════════════════════════════════════════════
-- เก็บ snapshot การกระทบยอดเงินตอนปิดยอด:
--   Expected Cash = เงินทอนตั้งต้น + รับเงินสด - รายจ่ายย่อย(เงินสด)
--   Over/Short    = เงินนับจริง - Expected Cash
-- + สรุปยอดโอน/บัตร (ยอด+จำนวนรายการ) ไว้เทียบกับ K Shop / EDC
-- ════════════════════════════════════════════════════════════

ALTER TABLE clinic_day_closes
    ADD COLUMN IF NOT EXISTS starting_float  numeric(12,2) DEFAULT 0,   -- เงินทอนตั้งต้น
    ADD COLUMN IF NOT EXISTS cash_received   numeric(12,2) DEFAULT 0,   -- รับเงินสดระหว่างวัน
    ADD COLUMN IF NOT EXISTS petty_total     numeric(12,2) DEFAULT 0,   -- รายจ่ายย่อย (เงินสด)
    ADD COLUMN IF NOT EXISTS expected_cash   numeric(12,2) DEFAULT 0,   -- เงินสดที่ควรมี
    ADD COLUMN IF NOT EXISTS actual_cash     numeric(12,2),             -- เงินสดนับจริง (null=ไม่ได้นับ)
    ADD COLUMN IF NOT EXISTS over_short      numeric(12,2) DEFAULT 0,   -- เกิน(+)/ขาด(-)
    ADD COLUMN IF NOT EXISTS transfer_total  numeric(12,2) DEFAULT 0,   -- ยอดโอนรวม
    ADD COLUMN IF NOT EXISTS transfer_count  int DEFAULT 0,             -- จำนวนรายการโอน
    ADD COLUMN IF NOT EXISTS credit_total    numeric(12,2) DEFAULT 0,   -- ยอดบัตรเครดิตรวม
    ADD COLUMN IF NOT EXISTS credit_count    int DEFAULT 0,             -- จำนวนรายการบัตร
    ADD COLUMN IF NOT EXISTS recon_note      text;                      -- หมายเหตุ (อธิบายเงินขาด/เกิน)
