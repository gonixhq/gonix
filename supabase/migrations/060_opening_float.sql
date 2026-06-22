-- ════════════════════════════════════════════════════════════
-- 060: เงินทอนตั้งต้นตอนเปิดร้าน (Opening Float) — ตั้งตอนเช้า กันลืมตอนปิด
-- ════════════════════════════════════════════════════════════
-- พนักงานบันทึกเงินทอนตั้งต้นตอนจัดลิ้นชักตอนเช้า → ตอนปิดยอดดึงมาเติมให้เอง
-- 1 แถวต่อ คลินิก-วัน (upsert)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinic_opening_float (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    float_date  date NOT NULL,
    amount      numeric(12,2) NOT NULL DEFAULT 0,
    set_by      uuid REFERENCES staff(id),
    set_at      timestamptz DEFAULT now(),
    UNIQUE (clinic_id, float_date)
);

CREATE INDEX IF NOT EXISTS idx_opening_float_clinic_date ON clinic_opening_float (clinic_id, float_date);
