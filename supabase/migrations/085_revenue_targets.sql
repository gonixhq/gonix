-- ════════════════════════════════════════════════════════════
-- 085: M2 Goal/Target Tracking — ตั้งเป้ารายได้รายเดือน/ไตรมาส
-- ════════════════════════════════════════════════════════════
-- period_key: 'YYYY-MM' (เดือน) หรือ 'YYYY-Qn' (ไตรมาส) เช่น 2026-06 / 2026-Q2
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS revenue_targets (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_key     text NOT NULL,                  -- 'YYYY-MM' หรือ 'YYYY-Qn'
    target_amount  numeric(14,2) NOT NULL DEFAULT 0,
    note           text,
    updated_by     uuid REFERENCES profiles(id),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_revenue_targets_clinic ON revenue_targets (clinic_id, period_key);

-- RLS clinic-scoped (ตาราง public ใหม่ใน Gonix ต้องมี policy เสมอ)
ALTER TABLE revenue_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revenue_targets_clinic ON revenue_targets;
CREATE POLICY revenue_targets_clinic ON revenue_targets FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
