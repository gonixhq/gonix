-- ════════════════════════════════════════════════════════════
-- 093: Schedule Approval Workflow — ส่งตารางเวรให้ Owner อนุมัติ
-- ════════════════════════════════════════════════════════════
-- ตารางเวรแต่ละเดือน (period_month = "YYYY-MM") มีสถานะ:
--   draft → pending → approved (= locked, ห้ามแก้) · pending → (reject) → draft
--   reopen: approved → draft (owner เปิดแก้ใหม่)
-- เก็บ log ทุก action ไว้ตรวจย้อนหลัง
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schedule_periods (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_month  text NOT NULL,                       -- "YYYY-MM"
    status        text NOT NULL DEFAULT 'draft',       -- draft | pending | approved
    shift_count   int NOT NULL DEFAULT 0,              -- snapshot ตอนส่งอนุมัติ
    submitted_by  uuid REFERENCES profiles(id),
    submitted_at  timestamptz,
    decided_by    uuid REFERENCES profiles(id),
    decided_at    timestamptz,
    decision_note text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, period_month)
);

CREATE TABLE IF NOT EXISTS schedule_approval_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_month  text NOT NULL,
    action        text NOT NULL,                       -- submit | approve | reject | reopen
    actor_id      uuid REFERENCES profiles(id),
    actor_name    text,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_periods_clinic ON schedule_periods (clinic_id, period_month);
CREATE INDEX IF NOT EXISTS idx_schedule_approval_log_month ON schedule_approval_log (clinic_id, period_month, created_at DESC);

-- ── RLS ──
ALTER TABLE schedule_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_periods_clinic ON schedule_periods;
CREATE POLICY schedule_periods_clinic ON schedule_periods FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE schedule_approval_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_approval_log_clinic ON schedule_approval_log;
CREATE POLICY schedule_approval_log_clinic ON schedule_approval_log FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
