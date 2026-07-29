-- ════════════════════════════════════════════════════════════
-- 119: ออกใบเสร็จย้อนหลัง (back-dated bill) — แยกวันที่พิมพ์ ออกจากวันลงบัญชี
-- ════════════════════════════════════════════════════════════
-- หลักการ (การเงินอยู่ที่ปัจจุบัน · แค่วันที่บนกระดาษย้อนหลัง):
--   invoice_date  = "วันลงบัญชี/ปิดยอด" (posting) = วันที่สร้างจริง — ห้ามย้อนหลัง
--                   → คีย์ EOD/รายงาน/commission ทั้งหมดคงเดิม (ไม่แตะ logic การเงิน)
--   bill_date     = "วันที่แสดงบนใบเสร็จ" (พิมพ์) — แก้ได้/ย้อนหลังได้ · default = invoice_date
--   created_at    = timestamp ที่แถวถูกสร้างจริง (immutable) — มีอยู่แล้ว
--   back-dated ⟺ bill_date < invoice_date (= created_at::date)
-- ════════════════════════════════════════════════════════════

-- ── 1. เพิ่ม bill_date + backfill = invoice_date (ของเดิมทั้งหมด = ไม่ย้อนหลัง) ──
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS bill_date date;
UPDATE invoice_headers SET bill_date = invoice_date WHERE bill_date IS NULL;

COMMENT ON COLUMN invoice_headers.invoice_date IS 'วันลงบัญชี/ปิดยอด (posting) = วันสร้างจริง ห้ามย้อนหลัง — คีย์ EOD/รายงาน/commission';
COMMENT ON COLUMN invoice_headers.bill_date    IS 'วันที่แสดงบนใบเสร็จ (พิมพ์) แก้ได้/ย้อนหลังได้ · default = invoice_date';

-- ── 2. audit trail ย้อนหลัง (แก้ไม่ได้) ──
CREATE TABLE IF NOT EXISTS backdated_bill_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inv_id       text NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
    bill_date    date NOT NULL,          -- วันที่เลือกให้แสดง (ย้อนหลัง)
    posting_date date NOT NULL,          -- invoice_date (วันลงบัญชีจริง = วันสร้าง)
    -- created_by: จงใจ "ไม่มี FK" ไป profiles → audit ต้องอยู่รอดแม้ผู้ใช้ถูกลบภายหลัง
    --             (เก็บ uuid ณ เวลานั้นไว้เป็นหลักฐาน ไม่ให้ถูก cascade/null ทิ้ง)
    created_by   uuid NOT NULL,
    logged_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_backdated_clinic ON backdated_bill_log (clinic_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_backdated_inv    ON backdated_bill_log (inv_id);

-- RLS: authenticated clinic-scoped · เปิดแค่ SELECT + INSERT (ไม่มี UPDATE/DELETE)
ALTER TABLE backdated_bill_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backdated_bill_log_select ON backdated_bill_log;
CREATE POLICY backdated_bill_log_select ON backdated_bill_log FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS backdated_bill_log_insert ON backdated_bill_log;
CREATE POLICY backdated_bill_log_insert ON backdated_bill_log FOR INSERT TO authenticated
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
-- (จงใจไม่มี policy UPDATE/DELETE → RLS ห้ามแก้/ลบ)

-- ── immutable "แม้แต่ service-role" (ซึ่ง BYPASSRLS) ──
-- BYPASSRLS ข้าม RLS policy ได้ แต่ข้าม "table grant" ไม่ได้ → REVOKE ระดับสิทธิ์ตาราง
-- ให้เหลือแค่ SELECT/INSERT · ห้าม UPDATE/DELETE/TRUNCATE ทุก role (ยกเว้น owner=postgres superuser)
REVOKE UPDATE, DELETE, TRUNCATE ON backdated_bill_log FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON backdated_bill_log FROM anon, authenticated, service_role;
GRANT  SELECT, INSERT ON backdated_bill_log TO authenticated;
GRANT  SELECT ON backdated_bill_log TO service_role;   -- service-role อ่านได้ (รายงาน) แต่แก้/ลบไม่ได้

-- ── 3. Trigger: enforce role + สร้าง audit ใน "ทรานแซกชันเดียวกัน" กับการสร้างบิล ──
-- ⭐ role guard อยู่ที่ DB (ไม่ใช่แค่ app) → "ทุก write path" (checkout/script/action อื่น)
--    ที่ตั้ง bill_date < invoice_date ต้องผ่านด่านนี้ บายพาสไม่ได้
--   • เฉพาะ owner/admin (จาก role ของ auth.uid()) → ไม่ใช่ = RAISE → invoice insert rollback
--   • created_by = auth.uid() (DB ใส่เอง ไม่เชื่อ app) · service-role/ไม่มี user → role null → block
-- Atomicity: trigger รันในทรานแซกชันเดียวกับ INSERT invoice_headers
--   → log/enforce fail = rollback ทั้งบิล · ไม่มี insert = ไม่มี log (audit ↔ บิล เกิด/ล้มพร้อมกัน)
CREATE OR REPLACE FUNCTION fn_log_backdated_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
    IF NEW.bill_date IS NOT NULL AND NEW.bill_date < NEW.invoice_date THEN
        -- enforce: back-date เฉพาะ owner/admin (DB-level — บายพาสจาก write path อื่นไม่ได้)
        SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
        IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'BACKDATE_FORBIDDEN: ออกใบเสร็จย้อนหลังได้เฉพาะ owner/admin เท่านั้น';
        END IF;
        INSERT INTO backdated_bill_log (clinic_id, inv_id, bill_date, posting_date, created_by)
        VALUES (NEW.clinic_id, NEW.id, NEW.bill_date, NEW.invoice_date, auth.uid());
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_backdated_bill ON invoice_headers;
CREATE TRIGGER trg_log_backdated_bill AFTER INSERT ON invoice_headers
    FOR EACH ROW EXECUTE FUNCTION fn_log_backdated_bill();

-- ── 4. bill_date immutable หลังสร้าง (ปิดช่อง edit-invoice ในอนาคตบายพาส audit) ──
-- guard เฉพาะ "ตอน bill_date เปลี่ยนจริง" → addPayment/void/refund/setCampaign (ไม่แตะ bill_date)
-- ผ่านตามปกติ · trigger นี้ต้องอยู่ "หลัง" backfill UPDATE ในข้อ 1 (ไม่งั้น backfill โดนบล็อก)
CREATE OR REPLACE FUNCTION fn_bill_date_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.bill_date IS DISTINCT FROM OLD.bill_date THEN
        RAISE EXCEPTION 'BILL_DATE_IMMUTABLE: bill_date แก้ไม่ได้หลังสร้างใบเสร็จ (กำหนดได้เฉพาะตอนออกบิล)';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bill_date_immutable ON invoice_headers;
CREATE TRIGGER trg_bill_date_immutable BEFORE UPDATE ON invoice_headers
    FOR EACH ROW EXECUTE FUNCTION fn_bill_date_immutable();

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT count(*) FROM invoice_headers WHERE bill_date IS NULL;   -- 0 (backfill ครบ)
--   SELECT count(*) FROM invoice_headers WHERE bill_date <> invoice_date;  -- 0 (ยังไม่มีย้อนหลัง)
-- ════════════════════════════════════════════════════════════
