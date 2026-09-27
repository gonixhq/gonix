-- ════════════════════════════════════════════════════════════
-- 162: บิลค้างจ่าย — เอกสารแบบ FlowAccount + ส่งสำนักงานบัญชี
-- ════════════════════════════════════════════════════════════
--   • ประเภทเอกสาร (ใบกำกับภาษี/ใบเสร็จ/ใบแจ้งหนี้/บิลเงินสด) · VAT (ไม่มี/แยก/รวม) · หัก ณ ที่จ่าย
--     amount = ยอดรวมทั้งสิ้น (รวม VAT) · net_pay = amount − wht_amount (ยอดโอนจริง)
--   • แนบรูป/PDF (clinic-assets/{clinic}/vendor-bills/{bill}/...) → ส่งสำนักงานบัญชี
--   • ต้นฉบับ: เก็บแล้วหรือยัง + เลขแฟ้ม · ส่งบัญชีแล้วเมื่อไหร่
--   • vendors: ที่อยู่ + สาขา (สำหรับใบกำกับภาษี / FlowAccount)
-- ════════════════════════════════════════════════════════════

ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'invoice';
ALTER TABLE vendor_bills DROP CONSTRAINT IF EXISTS vendor_bills_doc_type_chk;
ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_doc_type_chk CHECK (doc_type IN ('tax_invoice','receipt','invoice','cash_bill','other'));
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'none';
ALTER TABLE vendor_bills DROP CONSTRAINT IF EXISTS vendor_bills_vat_mode_chk;
ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_vat_mode_chk CHECK (vat_mode IN ('none','excl','incl'));
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS subtotal numeric(12,2);      -- ก่อน VAT
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS wht_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS wht_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;   -- [{path,name,size,type}]
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS original_filed boolean NOT NULL DEFAULT false;
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS original_ref text;           -- เลขแฟ้ม/ที่เก็บต้นฉบับ
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS sent_to_accountant_at timestamptz;
COMMENT ON COLUMN vendor_bills.amount IS 'ยอดรวมทั้งสิ้น (รวม VAT) — ยอดโอนจริง = amount − wht_amount';

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS branch text;   -- สำนักงานใหญ่ / สาขาที่ ...

-- ไฟล์แนบใช้ bucket clinic-assets เดิม (RLS ตาม segment แรก = clinic_id — mig 137)
