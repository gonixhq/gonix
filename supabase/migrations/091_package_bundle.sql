-- ════════════════════════════════════════════════════════════
-- 091: Bundle Package — คอสรวมหลายบริการ (feature 9)
-- ════════════════════════════════════════════════════════════
-- แนวทาง: bundle = service_package (is_bundle=true) ที่ชี้ไป component packages
-- ตอนซื้อ bundle → ระบบแตกเป็น patient_package แยกต่อ component (แบ่งราคาตามสัดส่วน)
-- → reuse ระบบ usage/ติดตามเดิม ไม่ต้องรื้อ
-- ════════════════════════════════════════════════════════════

ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS is_bundle boolean NOT NULL DEFAULT false;

-- component ของ bundle (bundle_id → component_id ทั้งคู่เป็น service_packages)
CREATE TABLE IF NOT EXISTS package_components (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bundle_id     uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    component_id  uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bundle_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_package_components_bundle ON package_components (bundle_id);

ALTER TABLE package_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS package_components_clinic ON package_components;
CREATE POLICY package_components_clinic ON package_components FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
