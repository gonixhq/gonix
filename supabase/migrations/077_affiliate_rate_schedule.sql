-- ════════════════════════════════════════════════════════════
-- 077: Affiliate Rate Schedule (ค่าคอมหลายขั้น) + Audit Log
-- ════════════════════════════════════════════════════════════
-- เปลี่ยนจาก % เดี่ยว (affiliates.commission_pct) เป็นตารางหลายขั้น
--   rate_basis = 'flat'      → ใช้ commission_pct เดิม (ค่าเริ่มต้น, ไม่กระทบของเก่า)
--              = 'bill_seq'  → % ลดตามลำดับบิลของลูกค้า (บิล1=10% บิล2+=5%)
--              = 'month_seq' → % ลดตามเดือนนับจากวันที่ attribute (เดือนแรก/เดือนถัดไป)
-- ════════════════════════════════════════════════════════════

ALTER TABLE affiliates
    ADD COLUMN IF NOT EXISTS rate_basis text NOT NULL DEFAULT 'flat';
    -- flat | bill_seq | month_seq

-- ตารางขั้นค่าคอม (ใช้เมื่อ rate_basis <> 'flat')
CREATE TABLE IF NOT EXISTS affiliate_rate_tiers (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    affiliate_id  uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    from_n        int  NOT NULL DEFAULT 1,        -- ใช้ตั้งแต่บิ/เดือนที่ N เป็นต้นไป (1-based)
    pct           numeric(5,2) NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (affiliate_id, from_n)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_rate_tiers_aff
    ON affiliate_rate_tiers (affiliate_id, from_n);

-- Audit log การเปลี่ยน rate (เก็บ snapshot ก่อน/หลังเป็น jsonb)
CREATE TABLE IF NOT EXISTS affiliate_rate_audit (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    affiliate_id  uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    actor_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
    old_value     jsonb,    -- { basis, flat_pct, tiers:[{from_n,pct}] } ก่อนแก้
    new_value     jsonb,    -- หลังแก้
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_rate_audit_aff
    ON affiliate_rate_audit (affiliate_id, created_at DESC);

-- หมายเหตุ: ไม่ใช้ RLS (ตามแนวเดียวกับ mig 073/076) — server action scope clinic_id เองผ่าน ctx()
