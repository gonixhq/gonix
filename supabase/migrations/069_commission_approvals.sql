-- ════════════════════════════════════════════════════════════
-- 069: Commission/DF Approval Workflow — ล็อก+อนุมัติยอด DF รายงวด
-- ════════════════════════════════════════════════════════════
-- เก็บ snapshot ยอดที่อนุมัติ ณ เวลาที่กดอนุมัติ → ถ้าบิลถูกแก้/ยกเลิกทีหลัง
-- ยอดที่อนุมัติแล้วจะไม่เปลี่ยน (มาตรฐานบัญชี) Payroll ดึงเฉพาะยอดที่อนุมัติ
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS commission_approvals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id        uuid NOT NULL REFERENCES staff(id),
    role            text NOT NULL,                  -- doctor / nurse / assistant / sales
    period_month    text NOT NULL,                  -- YYYY-MM
    approved_amount numeric(12,2) NOT NULL,         -- snapshot ยอด ณ เวลาอนุมัติ
    entries_count   int NOT NULL DEFAULT 0,         -- จำนวนรายการ ณ เวลาอนุมัติ
    approved_by     uuid REFERENCES profiles(id),
    approved_at     timestamptz NOT NULL DEFAULT now(),
    note            text,
    UNIQUE (clinic_id, staff_id, role, period_month)
);

CREATE INDEX IF NOT EXISTS idx_comm_approvals_period
    ON commission_approvals (clinic_id, period_month);
