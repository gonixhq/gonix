-- ════════════════════════════════════════════════════════════
-- 094: Shift Swap — ขอเปลี่ยน/สลับเวร
-- ════════════════════════════════════════════════════════════
-- พนักงาน (หรือ admin แทน) ขอให้คนอื่นรับเวรของตนแทน → admin อนุมัติ
-- อนุมัติ = ย้าย doctor_shifts.doctor_staff_id ไปเป็น to_staff_id
-- snapshot shift_date/from_staff กัน history หายเมื่อเวรถูกลบ
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id      uuid REFERENCES doctor_shifts(id) ON DELETE SET NULL,
    shift_date    date NOT NULL,                          -- snapshot
    from_staff_id uuid NOT NULL REFERENCES staff(id),     -- เจ้าของเวรเดิม
    to_staff_id   uuid NOT NULL REFERENCES staff(id),     -- คนรับเวรแทน
    reason        text,
    status        text NOT NULL DEFAULT 'pending',        -- pending | approved | rejected | cancelled
    requested_by  uuid REFERENCES profiles(id),
    decided_by    uuid REFERENCES profiles(id),
    decided_at    timestamptz,
    decision_note text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_swap_clinic_status ON shift_swap_requests (clinic_id, status, created_at DESC);

ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_swap_clinic ON shift_swap_requests;
CREATE POLICY shift_swap_clinic ON shift_swap_requests FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
