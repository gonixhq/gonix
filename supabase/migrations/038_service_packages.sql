-- ════════════════════════════════════════════════════════════
-- 038: ระบบคอสบริการ (Service Packages)
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - service_packages = แค็ตตาล็อกคอส (เช่น HIFU 5 ครั้ง 25,000 บาท)
--   - patient_packages = สิทธิ์ที่คนไข้ซื้อแล้ว (per patient)
--   - package_usages   = log การตัดครั้ง (เชื่อมกับ visit)
-- ════════════════════════════════════════════════════════════

-- ── Clean up (ถ้ามีของเก่าค้าง — เช่นจากการ migration ครึ่งๆ) ──
DROP VIEW  IF EXISTS v_patient_packages_active CASCADE;
DROP TABLE IF EXISTS package_usages CASCADE;
DROP TABLE IF EXISTS patient_packages CASCADE;
DROP TABLE IF EXISTS service_packages CASCADE;

-- ── ตาราง service_packages (catalog) ──
CREATE TABLE IF NOT EXISTS service_packages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            text NOT NULL,
    name            text NOT NULL,
    description     text,
    category        text,                   -- HIFU / DRIP / FILLER / LASER / etc.
    total_sessions  int NOT NULL CHECK (total_sessions > 0),
    price           numeric(12,2) NOT NULL CHECK (price >= 0),
    validity_days   int NOT NULL DEFAULT 365 CHECK (validity_days > 0),
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, code)
);

CREATE INDEX IF NOT EXISTS idx_service_packages_active
    ON service_packages (clinic_id, is_active) WHERE is_active = true;

COMMENT ON TABLE service_packages IS 'แค็ตตาล็อกคอสบริการที่คลินิกขาย';
COMMENT ON COLUMN service_packages.total_sessions IS 'จำนวนครั้งทั้งหมดต่อแพ็ค';
COMMENT ON COLUMN service_packages.validity_days IS 'อายุการใช้งานหลังซื้อ (วัน)';


-- ── ตาราง patient_packages (สิทธิ์ที่ซื้อแล้ว) ──
CREATE TABLE IF NOT EXISTS patient_packages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hn                  text NOT NULL REFERENCES patients(hn),
    package_id          uuid NOT NULL REFERENCES service_packages(id),
    invoice_id          text REFERENCES invoice_headers(id),

    -- Snapshot ตอนซื้อ (กัน catalog แก้ราคา/จำนวนครั้งย้อนหลัง)
    package_name        text NOT NULL,
    total_sessions      int NOT NULL,
    paid_amount         numeric(12,2) NOT NULL DEFAULT 0,

    used_sessions       int NOT NULL DEFAULT 0,
    purchased_at        timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL,

    status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','expired','refunded','cancelled')),
    note                text,
    created_by          uuid REFERENCES staff(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_packages_hn        ON patient_packages (hn, status);
CREATE INDEX IF NOT EXISTS idx_patient_packages_clinic    ON patient_packages (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_packages_expires   ON patient_packages (expires_at) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_patient_packages_invoice   ON patient_packages (invoice_id);

COMMENT ON TABLE patient_packages IS 'คอสที่คนไข้ซื้อแล้ว (สิทธิ์การใช้งาน)';


-- ── ตาราง package_usages (log การตัดครั้ง) ──
CREATE TABLE IF NOT EXISTS package_usages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_package_id  uuid NOT NULL REFERENCES patient_packages(id) ON DELETE CASCADE,
    visit_vn            text REFERENCES visits(vn),
    session_no          int NOT NULL CHECK (session_no > 0),
    used_at             timestamptz NOT NULL DEFAULT now(),
    used_by             uuid REFERENCES staff(id),
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_usages_pp  ON package_usages (patient_package_id);
CREATE INDEX IF NOT EXISTS idx_package_usages_vn  ON package_usages (visit_vn);

COMMENT ON TABLE package_usages IS 'บันทึกการใช้สิทธิ์ครั้งต่อครั้ง';


-- ── Trigger: updated_at ──
CREATE OR REPLACE FUNCTION fn_service_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_packages_updated_at ON service_packages;
CREATE TRIGGER trg_service_packages_updated_at
    BEFORE UPDATE ON service_packages
    FOR EACH ROW EXECUTE FUNCTION fn_service_packages_updated_at();

DROP TRIGGER IF EXISTS trg_patient_packages_updated_at ON patient_packages;
CREATE TRIGGER trg_patient_packages_updated_at
    BEFORE UPDATE ON patient_packages
    FOR EACH ROW EXECUTE FUNCTION fn_service_packages_updated_at();


-- ── RLS ──
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_usages   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sp_clinic_isolation ON service_packages;
CREATE POLICY sp_clinic_isolation ON service_packages
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS pp_clinic_isolation ON patient_packages;
CREATE POLICY pp_clinic_isolation ON patient_packages
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS pu_clinic_isolation ON package_usages;
CREATE POLICY pu_clinic_isolation ON package_usages
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));


-- ════════════════════════════════════════════════════════════
-- View: patient_packages_summary (พร้อมข้อมูล package + คงเหลือ)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_patient_packages_active AS
SELECT
    pp.id,
    pp.clinic_id,
    pp.hn,
    pp.package_id,
    pp.package_name,
    pp.total_sessions,
    pp.used_sessions,
    (pp.total_sessions - pp.used_sessions) AS remaining_sessions,
    pp.paid_amount,
    pp.purchased_at,
    pp.expires_at,
    pp.status,
    pp.invoice_id,
    pp.note,
    sp.category,
    CASE
        WHEN pp.expires_at < now() THEN true
        ELSE false
    END AS is_expired,
    GREATEST(0, EXTRACT(day FROM pp.expires_at - now())::int) AS days_remaining
FROM patient_packages pp
LEFT JOIN service_packages sp ON sp.id = pp.package_id;


-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT * FROM service_packages LIMIT 5;
--   SELECT * FROM v_patient_packages_active WHERE hn='HN000001';
-- ════════════════════════════════════════════════════════════
