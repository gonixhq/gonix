-- ════════════════════════════════════════════════════════════
-- 111: Codify RLS ของตารางสำคัญเข้า migration (P14 — แก้ drift)
-- ════════════════════════════════════════════════════════════
-- ปัญหา: RLS + policy ของ core table (patients/visits/invoice/...) ถูกตั้งผ่าน
--        Supabase dashboard → เปิดใช้ + ผูก clinic_id ถูกต้องใน DB จริง
--        แต่ "ไม่อยู่ใน migration" → ถ้า rebuild DB จาก migration ใหม่
--        (db reset / staging ใหม่) ตารางเหล่านี้จะ "ไม่มี RLS" = ข้อมูลรั่ว
--
-- ไฟล์นี้ = เอา policy ที่มีอยู่จริงมาเขียนเป็นโค้ด (คัดจาก pg_policies เป๊ะ)
-- • รันบน DB ปัจจุบัน = net-zero (DROP policy เดิม + CREATE เหมือนเดิม, ใน transaction)
-- • รันบน DB เปล่า (rebuild) = สร้าง RLS ให้ครบ
--
-- ขอบเขต: เฉพาะ 16 ตารางที่ถือ PII/PHI/การเงิน/ปฏิบัติการหลัก (drift ยืนยันแล้ว)
--         ตารางอื่น (config/template/log ทั่วไป) ที่ drift เก็บเป็น follow-up
--         ตารางที่ RLS อยู่ใน mig อยู่แล้ว (003/038/047/106/...) ไม่แตะ
--
-- pattern:
--   clinic_isolation = clinic_id = (SELECT clinic_id FROM profiles WHERE id=auth.uid())
--   owner_bypass     = EXISTS(... role owner/admin ... clinic_id ตรง)  [permissive OR]
--   (anon → auth.uid()=null → subquery ว่าง → 0 rows = ปลอดภัย)
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── patients (PII) ──
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patients_clinic_isolation ON patients;
CREATE POLICY patients_clinic_isolation ON patients FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));
DROP POLICY IF EXISTS patients_owner_bypass ON patients;
CREATE POLICY patients_owner_bypass ON patients FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['owner'::staff_role, 'admin'::staff_role])
      AND profiles.clinic_id = patients.clinic_id));

-- ── visits (เวชระเบียน) ──
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visits_clinic_isolation ON visits;
CREATE POLICY visits_clinic_isolation ON visits FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));
DROP POLICY IF EXISTS visits_owner_bypass ON visits;
CREATE POLICY visits_owner_bypass ON visits FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['owner'::staff_role, 'admin'::staff_role])
      AND profiles.clinic_id = visits.clinic_id));

-- ── invoice_headers (การเงิน) ──
ALTER TABLE invoice_headers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_headers_clinic_isolation ON invoice_headers;
CREATE POLICY invoice_headers_clinic_isolation ON invoice_headers FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));
DROP POLICY IF EXISTS invoice_headers_owner_bypass ON invoice_headers;
CREATE POLICY invoice_headers_owner_bypass ON invoice_headers FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['owner'::staff_role, 'admin'::staff_role])
      AND profiles.clinic_id = invoice_headers.clinic_id));

-- ── invoice_items (การเงิน) ──
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_items_clinic_isolation ON invoice_items;
CREATE POLICY invoice_items_clinic_isolation ON invoice_items FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── payment_logs (การเงิน) ──
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_logs_clinic_isolation ON payment_logs;
CREATE POLICY payment_logs_clinic_isolation ON payment_logs FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── drug_orders (เวชระเบียน) ──
ALTER TABLE drug_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drug_orders_clinic_isolation ON drug_orders;
CREATE POLICY drug_orders_clinic_isolation ON drug_orders FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── lab_orders (เวชระเบียน) ──
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_orders_clinic_isolation ON lab_orders;
CREATE POLICY lab_orders_clinic_isolation ON lab_orders FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── appointments ──
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_clinic_isolation ON appointments;
CREATE POLICY appointments_clinic_isolation ON appointments FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── queue_entries ──
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS queue_entries_clinic_isolation ON queue_entries;
CREATE POLICY queue_entries_clinic_isolation ON queue_entries FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── audit_logs ──
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_clinic_isolation ON audit_logs;
CREATE POLICY audit_logs_clinic_isolation ON audit_logs FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── inventory (สต๊อก/ต้นทุน) ──
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_clinic_isolation ON inventory;
CREATE POLICY inventory_clinic_isolation ON inventory FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));
DROP POLICY IF EXISTS inventory_owner_bypass ON inventory;
CREATE POLICY inventory_owner_bypass ON inventory FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['owner'::staff_role, 'admin'::staff_role])
      AND profiles.clinic_id = inventory.clinic_id));

-- ── staff (PII พนักงาน) ──
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_clinic_isolation ON staff;
CREATE POLICY staff_clinic_isolation ON staff FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));
DROP POLICY IF EXISTS staff_owner_bypass ON staff;
CREATE POLICY staff_owner_bypass ON staff FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['owner'::staff_role, 'admin'::staff_role])
      AND profiles.clinic_id = staff.clinic_id));

-- ── stock_card (สต๊อก) ──
ALTER TABLE stock_card ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_card_clinic_isolation ON stock_card;
CREATE POLICY stock_card_clinic_isolation ON stock_card FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── service_catalog (รายการบริการ/ราคา) ──
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_catalog_clinic_isolation ON service_catalog;
CREATE POLICY service_catalog_clinic_isolation ON service_catalog FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- ── medical_certificates ({authenticated} + ผูกผ่าน visits) ──
ALTER TABLE medical_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_cert: clinic isolation" ON medical_certificates;
CREATE POLICY "med_cert: clinic isolation" ON medical_certificates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM visits v WHERE v.vn = medical_certificates.vn AND v.clinic_id = my_clinic_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM visits v WHERE v.vn = medical_certificates.vn AND v.clinic_id = my_clinic_id()));

-- ── referrals ({authenticated} + ผูกผ่าน visits) ──
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referrals: clinic isolation" ON referrals;
CREATE POLICY "referrals: clinic isolation" ON referrals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM visits v WHERE v.vn = referrals.vn AND v.clinic_id = my_clinic_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM visits v WHERE v.vn = referrals.vn AND v.clinic_id = my_clinic_id()));

COMMIT;

-- ════════════════════════════════════════════════════════════
-- Verification (หลังรัน — ต้องได้ผลเหมือนก่อนรัน):
--   SELECT tablename, count(*) FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('patients','visits','invoice_headers','invoice_items','payment_logs',
--       'drug_orders','lab_orders','appointments','queue_entries','audit_logs','inventory',
--       'staff','stock_card','service_catalog','medical_certificates','referrals')
--   GROUP BY tablename ORDER BY tablename;
--   -- นับ policy ต้องเท่าเดิม + แอปยังใช้งานปกติ (เปิด dashboard เช็คคนไข้/ใบเสร็จ/ตรวจ)
-- ════════════════════════════════════════════════════════════
