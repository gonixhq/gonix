-- ════════════════════════════════════════════════════════════
-- 047: คลินิกนิรนาม (Anonymous Blood Testing)
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - ตรวจเลือดแบบ "ไม่ระบุตัวตน" — ไม่มีชื่อ/HN ใช้ "รหัสเคส" (case_code) แทน
--   - เก็บเฉพาะ เพศ + อายุ (ไว้ทำสถิติ) ไม่ผูกกับตาราง patients/visits
--   - workflow เต็มรูป: ลงทะเบียน → ให้คำปรึกษาก่อนตรวจ → ตรวจ/บันทึกผล →
--     ให้คำปรึกษาหลังตรวจ → ออกใบเสร็จนิรนาม → ค้น/พิมพ์ผลด้วยรหัส
--   - รายการตรวจเลือกจาก service_catalog (กำหนดเองได้)
--   - การเงินแยกจากระบบ invoice ปกติ (กันไม่ให้ข้อมูลนิรนามปนกับผู้ป่วยที่ระบุตัวตน)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS anon_cases (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id         uuid REFERENCES branches(id) ON DELETE SET NULL,
    case_code         text NOT NULL,            -- รหัสนิรนามที่มอบให้ผู้รับบริการ
    case_date         date NOT NULL,            -- วันลงทะเบียน (เวลาไทย)
    sex               text,                     -- male / female / other
    age               int,                      -- อายุ (ปี)
    risk_note         text,                     -- ความเสี่ยง/บันทึกก่อนตรวจ

    -- counseling ก่อน/หลังตรวจ
    pre_counsel_done  bool DEFAULT false,
    pre_counsel_note  text,
    pre_counsel_by    uuid REFERENCES profiles(id),
    pre_counsel_at    timestamptz,
    post_counsel_done bool DEFAULT false,
    post_counsel_note text,
    post_counsel_by   uuid REFERENCES profiles(id),
    post_counsel_at   timestamptz,

    result_appt_date  date,                     -- นัดฟังผล

    -- ใบเสร็จนิรนาม (self-contained)
    total_amount      numeric DEFAULT 0,
    paid              bool DEFAULT false,
    payment_method    text,                     -- cash / transfer / qr_promptpay / credit_card
    paid_at           timestamptz,
    receipt_no        text,

    status            text NOT NULL DEFAULT 'registered', -- registered / collected / resulted / closed
    note              text,
    created_by        uuid REFERENCES profiles(id),
    created_at        timestamptz DEFAULT now(),
    UNIQUE (clinic_id, case_code)
);

CREATE INDEX IF NOT EXISTS idx_anon_cases_clinic_date ON anon_cases (clinic_id, case_date DESC);
CREATE INDEX IF NOT EXISTS idx_anon_cases_status      ON anon_cases (clinic_id, status);

COMMENT ON TABLE anon_cases IS 'เคสตรวจเลือดนิรนาม — ไม่ผูกกับ patients/visits';
COMMENT ON COLUMN anon_cases.case_code IS 'รหัสนิรนามที่ใช้แทนตัวตน (มอบให้ผู้รับบริการไว้ค้น/ฟังผล)';

CREATE TABLE IF NOT EXISTS anon_case_tests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         uuid NOT NULL REFERENCES anon_cases(id) ON DELETE CASCADE,
    service_id      uuid REFERENCES service_catalog(id) ON DELETE SET NULL,
    test_name       text NOT NULL,              -- snapshot ชื่อ (กันชื่อหายถ้าลบ service)
    price           numeric DEFAULT 0,
    result_value    text,                       -- ค่าผล เช่น Non-reactive / Reactive / ค่าเลข
    result_status   text DEFAULT 'pending',     -- pending / negative / positive / inconclusive
    result_note     text,
    resulted_by     uuid REFERENCES profiles(id),
    resulted_at     timestamptz,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anon_tests_case ON anon_case_tests (case_id);

COMMENT ON TABLE anon_case_tests IS 'รายการตรวจ + ผลของแต่ละเคสนิรนาม';

-- ── RLS ──
ALTER TABLE anon_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE anon_case_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_cases_select ON anon_cases;
CREATE POLICY anon_cases_select ON anon_cases FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS anon_cases_insert ON anon_cases;
CREATE POLICY anon_cases_insert ON anon_cases FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS anon_cases_update ON anon_cases;
CREATE POLICY anon_cases_update ON anon_cases FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS anon_cases_delete ON anon_cases;
CREATE POLICY anon_cases_delete ON anon_cases FOR DELETE USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS anon_tests_all ON anon_case_tests;
CREATE POLICY anon_tests_all ON anon_case_tests FOR ALL USING (
    case_id IN (
        SELECT id FROM anon_cases
        WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    )
) WITH CHECK (
    case_id IN (
        SELECT id FROM anon_cases
        WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    )
);

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT case_code, case_date, sex, age, status, total_amount, paid
--     FROM anon_cases ORDER BY case_date DESC;
--   SELECT c.case_code, t.test_name, t.result_status, t.result_value
--     FROM anon_case_tests t JOIN anon_cases c ON c.id = t.case_id;
-- ════════════════════════════════════════════════════════════
