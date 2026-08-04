-- 125_inventory_lots_rls.sql
-- inventory_lots เปิด RLS ไว้ (security audit) แต่ "ไม่มี policy" → แอปอ่าน/เขียนล็อตไม่ได้เลย
-- อาการ: รับเข้าสต๊อกแล้วล็อตไม่เกิด (insert เงียบ), ฉลากไม่เห็นวันหมดอายุ, FEFO ไม่ทำงาน
-- แก้: เพิ่ม policy clinic isolation แบบเดียวกับตารางอื่น (mig 111)

ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_lots_clinic_isolation ON inventory_lots;
CREATE POLICY inventory_lots_clinic_isolation ON inventory_lots FOR ALL TO public
  USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));
