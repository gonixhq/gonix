-- ════════════════════════════════════════════════════════════
-- 087: ระบบติดตามหลังการรักษา (Follow-up System) — เฟส 1 schema
-- ════════════════════════════════════════════════════════════

-- รอบการติดตามผลต่อบริการ (comma-separated วัน) เช่น "1,7,14"
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS follow_up_days text;

-- งานติดตามผล
CREATE TABLE IF NOT EXISTS follow_up_tasks (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hn                 text NOT NULL REFERENCES patients(hn),
    vn                 text,
    invoice_id         text REFERENCES invoice_headers(id),
    service_name       text,                          -- snapshot บริการที่ทำ
    due_date           date NOT NULL,                 -- วันครบกำหนดติดตาม
    status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','contacted','unreachable','callback','done','cancelled')),
    severity           text NOT NULL DEFAULT 'green'
                       CHECK (severity IN ('green','yellow','red')),
    symptom_note       text,                          -- อาการ/feedback (เก็บใน EMR)
    assigned_doctor_id uuid REFERENCES staff(id),     -- แพทย์เจ้าของไข้ (จาก visit)
    escalated_at       timestamptz,
    escalated_by       uuid REFERENCES profiles(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    completed_at       timestamptz,
    completed_by       uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_followup_due    ON follow_up_tasks (clinic_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_followup_hn     ON follow_up_tasks (clinic_id, hn);
CREATE INDEX IF NOT EXISTS idx_followup_inv    ON follow_up_tasks (invoice_id);
CREATE INDEX IF NOT EXISTS idx_followup_doctor ON follow_up_tasks (assigned_doctor_id, status);

-- log การอัปเดตสถานะ/บันทึกอาการ/escalate (ให้แพทย์ดูย้อนหลัง + แสดงใน patient profile)
CREATE TABLE IF NOT EXISTS follow_up_task_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id     uuid NOT NULL REFERENCES follow_up_tasks(id) ON DELETE CASCADE,
    action      text NOT NULL,                        -- status_change | note | escalate | review_sent | referral_sent
    status      text,
    severity    text,
    note        text,
    actor_id    uuid REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_log_task ON follow_up_task_log (task_id, created_at);

-- ── RLS clinic-scoped (ตาราง public ใหม่ต้องมี policy เสมอ) ──
ALTER TABLE follow_up_tasks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_task_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follow_up_tasks_clinic ON follow_up_tasks;
CREATE POLICY follow_up_tasks_clinic ON follow_up_tasks FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS follow_up_task_log_clinic ON follow_up_task_log;
CREATE POLICY follow_up_task_log_clinic ON follow_up_task_log FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
