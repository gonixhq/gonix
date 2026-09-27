-- ════════════════════════════════════════════════════════════
-- 164: ใบเตรียมจ่าย (แบบ FlowAccount) — รวมหลายบิลของผู้ขายเดียวกัน จ่ายครั้งเดียว
-- ════════════════════════════════════════════════════════════
--   สถานะ: prepared (เตรียมจ่าย) → approved (อนุมัติแล้ว) → paid (ชำระแล้ว) · cancelled
--   จ่ายใบเตรียมจ่าย → บิลทุกใบในนั้น paid ตาม (วันที่/วิธี/อ้างอิงเดียวกัน)
--   ผู้เตรียม: owner/admin/accountant · ผู้อนุมัติ: owner/admin (เจ้าของได้แจ้ง LINE)
--   ขยายสิทธิ์เขียนบิล/ผู้ขายให้ accountant (บันทึกบิล + เตรียมจ่ายได้)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_batches (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_no      text NOT NULL,
    vendor        text NOT NULL,
    status        text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','paid','cancelled')),
    total         numeric(12,2) NOT NULL DEFAULT 0,      -- รวมทั้งสิ้น (รวม VAT)
    wht_total     numeric(12,2) NOT NULL DEFAULT 0,
    net_total     numeric(12,2) NOT NULL DEFAULT 0,      -- ยอดโอนจริง
    pay_date      date,                                  -- วันที่ตั้งใจจ่าย
    note          text,
    prepared_by   uuid REFERENCES profiles(id),
    prepared_at   timestamptz NOT NULL DEFAULT now(),
    approved_by   uuid REFERENCES profiles(id),
    approved_at   timestamptz,
    paid_at       date,
    paid_method   text,
    paid_ref      text,
    UNIQUE (clinic_id, batch_no)
);
CREATE INDEX IF NOT EXISTS idx_payment_batches_clinic ON payment_batches (clinic_id, status, prepared_at DESC);
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES payment_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_bills_batch ON vendor_bills (batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE payment_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_batches_select ON payment_batches;
CREATE POLICY payment_batches_select ON payment_batches FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS payment_batches_write ON payment_batches;
CREATE POLICY payment_batches_write ON payment_batches FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin','accountant')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin','accountant')));

-- accountant บันทึกบิล/ผู้ขายได้
DROP POLICY IF EXISTS vendor_bills_write ON vendor_bills;
CREATE POLICY vendor_bills_write ON vendor_bills FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin','accountant')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin','accountant')));
DROP POLICY IF EXISTS vendors_write ON vendors;
CREATE POLICY vendors_write ON vendors FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin','accountant')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin','accountant')));

-- อนุมัติได้เฉพาะ owner/admin (กันพนักงานบัญชีอนุมัติเอง)
CREATE OR REPLACE FUNCTION public.fn_payment_batch_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved') THEN
        SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
        IF COALESCE(v_role, '') NOT IN ('owner','admin') THEN RAISE EXCEPTION 'อนุมัติได้เฉพาะเจ้าของ/ผู้จัดการ'; END IF;
    END IF;
    -- จ่ายโดยไม่ผ่านอนุมัติ ได้เฉพาะ owner/admin
    IF NEW.status = 'paid' AND OLD.status = 'prepared' THEN
        SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
        IF COALESCE(v_role, '') NOT IN ('owner','admin') THEN RAISE EXCEPTION 'ต้องให้เจ้าของ/ผู้จัดการอนุมัติก่อนจ่าย'; END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payment_batch_guard ON payment_batches;
CREATE TRIGGER trg_payment_batch_guard BEFORE UPDATE ON payment_batches FOR EACH ROW EXECUTE FUNCTION public.fn_payment_batch_guard();
