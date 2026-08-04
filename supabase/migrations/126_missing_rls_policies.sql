-- 126_missing_rls_policies.sql
-- ตารางที่ security audit เปิด RLS ไว้ "แต่ลืมใส่ policy" → แอปอ่าน/เขียนไม่ได้เลย (โดนล็อกเงียบๆ)
-- เพิ่ม policy clinic isolation แบบเดียวกับ mig 111 (เฉพาะตารางที่มี clinic_id + แอปเข้าถึงตรงผ่าน client)
--
-- หมายเหตุ: anon_result_rl / line_link_rl / pending_reg_rl "ไม่ต้อง" policy —
--           เป็นตาราง rate-limit ที่แตะผ่านฟังก์ชัน SECURITY DEFINER เท่านั้น (bypass RLS อยู่แล้ว) ปล่อยล็อกไว้ถูกต้อง

-- announcements (ประกาศในระบบ)
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_clinic_isolation ON announcements;
CREATE POLICY announcements_clinic_isolation ON announcements FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- clinic_opening_float (เงินทอนตั้งต้น / petty cash)
ALTER TABLE clinic_opening_float ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_opening_float_clinic_isolation ON clinic_opening_float;
CREATE POLICY clinic_opening_float_clinic_isolation ON clinic_opening_float FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- commission_approvals (อนุมัติค่าคอมมิชชั่น)
ALTER TABLE commission_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_approvals_clinic_isolation ON commission_approvals;
CREATE POLICY commission_approvals_clinic_isolation ON commission_approvals FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- patient_referrals (ระบบแนะนำคนไข้ / referral)
ALTER TABLE patient_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_referrals_clinic_isolation ON patient_referrals;
CREATE POLICY patient_referrals_clinic_isolation ON patient_referrals FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- price_approvals (อนุมัติส่วนลด/ราคาพิเศษ)
ALTER TABLE price_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_approvals_clinic_isolation ON price_approvals;
CREATE POLICY price_approvals_clinic_isolation ON price_approvals FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));
