-- ════════════════════════════════════════════════════════════
-- 090: Package Management — commission ต่อคอส + max discount + price history
-- ════════════════════════════════════════════════════════════

-- ค่าตอบแทน % ต่อคอส (แพทย์/พยาบาล) — feature 11
-- หมายเหตุ: sales_commission_pct (เซลล์) มีอยู่แล้วในตาราง เพิ่มแค่ doctor/nurse
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS commission_doctor_pct numeric(5,2);
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS commission_nurse_pct  numeric(5,2);

-- ส่วนลดสูงสุดที่ให้ได้โดยไม่ต้องขออนุมัติ (%) — feature 12 (เชื่อม module 9 approval)
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS max_discount_pct numeric(5,2);

-- ประวัติการเปลี่ยนราคาคอส — feature 10
-- (ลูกค้าที่ซื้อก่อนหน้าไม่กระทบ เพราะ patient_packages snapshot paid_amount ตอนซื้ออยู่แล้ว)
CREATE TABLE IF NOT EXISTS package_price_history (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    package_id  uuid NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
    old_price   numeric(12,2),
    new_price   numeric(12,2) NOT NULL,
    changed_by  uuid REFERENCES profiles(id),
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_price_history ON package_price_history (package_id, created_at DESC);

-- RLS clinic-scoped
ALTER TABLE package_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS package_price_history_clinic ON package_price_history;
CREATE POLICY package_price_history_clinic ON package_price_history FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
