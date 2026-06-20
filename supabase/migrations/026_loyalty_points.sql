-- ════════════════════════════════════════════════════════════
-- 026: Loyalty Points System
-- ════════════════════════════════════════════════════════════
-- คะแนนสะสมจากการเข้ารับบริการ
-- - แต่ละ visit ที่ completed ได้ 10 คะแนน
-- - คะแนนหมดอายุทุกๆ 1 ปี นับจากวันที่ลงทะเบียน (first_visit_date)
-- - บันทึกประวัติทุกรายการ: earn / redeem / adjust / expire

-- ── Enum สำหรับประเภท transaction ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_txn_type') THEN
    CREATE TYPE loyalty_txn_type AS ENUM (
      'earn',           -- ได้คะแนนจากการมารับบริการ (auto)
      'redeem',         -- แลกใช้คะแนน
      'adjust',         -- ปรับโดย admin (เพิ่ม/ลด แบบ manual)
      'expire'          -- คะแนนหมดอายุ (recorded for audit; balance ignores expired earn)
    );
  END IF;
END $$;

-- ── Table ──
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hn            text NOT NULL REFERENCES patients(hn) ON DELETE CASCADE,

  txn_type      loyalty_txn_type NOT NULL,
  points        integer NOT NULL,        -- + สำหรับ earn/adjust+, - สำหรับ redeem/adjust-/expire

  -- For earnings
  vn            text REFERENCES visits(vn) ON DELETE SET NULL,
  earned_at     date,                     -- วันที่ได้รับ
  expires_at    date,                     -- วันที่จะหมดอายุ (สำหรับ earn)

  -- For redemptions
  redeem_item   text,                     -- "ส่วนลด 100 บาท", "ตรวจฟรี" ฯลฯ

  -- Common
  note          text,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')
);

CREATE INDEX IF NOT EXISTS idx_loyalty_txn_hn        ON loyalty_transactions(hn);
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_clinic    ON loyalty_transactions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_expires   ON loyalty_transactions(expires_at) WHERE txn_type = 'earn';
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_created   ON loyalty_transactions(created_at DESC);

-- ── RLS: clinic isolation ──
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loyalty_txn_clinic ON loyalty_transactions;
CREATE POLICY loyalty_txn_clinic ON loyalty_transactions
  FOR ALL
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── Helper function: คำนวณวันครบรอบลงทะเบียนถัดไป (next anniversary) ──
CREATE OR REPLACE FUNCTION fn_next_anniversary(p_registration_date date, p_from_date date)
RETURNS date AS $$
DECLARE
  anniversary date;
BEGIN
  IF p_registration_date IS NULL THEN
    RETURN (p_from_date + INTERVAL '1 year')::date;
  END IF;

  -- วันครบรอบของปีนั้นๆ
  anniversary := MAKE_DATE(
    EXTRACT(YEAR FROM p_from_date)::int,
    EXTRACT(MONTH FROM p_registration_date)::int,
    LEAST(EXTRACT(DAY FROM p_registration_date)::int, 28)  -- handle leap year edge
  );

  -- ถ้าครบรอบของปีปัจจุบันผ่านมาแล้ว → ใช้ของปีถัดไป
  IF anniversary <= p_from_date THEN
    anniversary := anniversary + INTERVAL '1 year';
  END IF;

  RETURN anniversary;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Helper function: คำนวณคะแนนคงเหลือของผู้ป่วย ──
CREATE OR REPLACE FUNCTION fn_loyalty_balance(p_hn text)
RETURNS integer AS $$
DECLARE
  total integer;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN txn_type = 'earn' AND (expires_at IS NULL OR expires_at > CURRENT_DATE) THEN points
      WHEN txn_type = 'redeem' THEN points  -- already negative
      WHEN txn_type = 'adjust' THEN points
      ELSE 0  -- expire txns excluded (just for audit)
    END
  ), 0)
  INTO total
  FROM loyalty_transactions
  WHERE hn = p_hn;

  RETURN total;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── Trigger: auto-award เมื่อ visit เปลี่ยน status เป็น completed ──
CREATE OR REPLACE FUNCTION fn_award_visit_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_points integer := 10;  -- คะแนนต่อ visit
  v_registration_date date;
  v_anniversary date;
BEGIN
  -- ทำงานเฉพาะตอน status เปลี่ยนเป็น completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- ตรวจสอบว่าเคยให้คะแนนสำหรับ vn นี้แล้วหรือยัง (กันการให้ซ้ำ)
    IF NOT EXISTS (
      SELECT 1 FROM loyalty_transactions
      WHERE vn = NEW.vn AND txn_type = 'earn'
    ) THEN
      -- ดึงวันลงทะเบียนผู้ป่วย
      SELECT first_visit_date INTO v_registration_date
        FROM patients WHERE hn = NEW.hn;

      -- คำนวณวันหมดอายุ = ครบรอบลงทะเบียนถัดไป
      v_anniversary := fn_next_anniversary(v_registration_date, CURRENT_DATE);

      INSERT INTO loyalty_transactions
        (clinic_id, hn, vn, txn_type, points, earned_at, expires_at, note)
      VALUES
        (NEW.clinic_id, NEW.hn, NEW.vn, 'earn', v_points, CURRENT_DATE, v_anniversary,
         'อัตโนมัติ: visit เสร็จสมบูรณ์');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loyalty_award_on_visit_complete ON visits;
CREATE TRIGGER trg_loyalty_award_on_visit_complete
  AFTER UPDATE OF status ON visits
  FOR EACH ROW
  EXECUTE FUNCTION fn_award_visit_completion();

COMMENT ON TABLE loyalty_transactions IS 'ประวัติคะแนนสะสม — earn จาก visit, redeem โดย staff, adjust โดย admin';
COMMENT ON FUNCTION fn_next_anniversary IS 'หาวันครบรอบลงทะเบียนถัดไปนับจากวันที่กำหนด';
COMMENT ON FUNCTION fn_loyalty_balance IS 'คำนวณคะแนนคงเหลือ (ไม่รวมคะแนนที่หมดอายุแล้ว)';
