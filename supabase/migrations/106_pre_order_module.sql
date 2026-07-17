-- ════════════════════════════════════════════════════════════
-- 106: Pre-Order & Doctor Gate Module (Phase 1)
-- ════════════════════════════════════════════════════════════
-- ปรับจากสเปก 001_pre_order_module.sql ให้ตรง schema จริงของ Gonix:
--   • tenant_id            -> clinic_id (REFERENCES tenants(id))
--   • patients(id) uuid    -> patients(hn) text  [PK จริงคือ hn]
--   • services(id)         -> service_catalog(id)
--   • visits(id) uuid      -> visits(vn) text     [PK จริงคือ vn]
--   • auth.tenant_id()     -> clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
--   • RLS FOR ALL + WITH CHECK (pattern เดียวกับ mig 084)
-- Policies: P1 มัดจำ 90 วัน · P2 auto-credit + ขยาย 1 ครั้ง · P3 มัดจำขั้นต่ำ ·
--           P4 มัดจำเกิน→เลือก · P5 snapshot ถาวร · P6 reject ไม่คิดค่า consult
-- RBAC ระดับ action enforce ที่ app (lib/permissions.ts pre_order.*) — trigger เป็น safety net
-- ════════════════════════════════════════════════════════════

-- ── 1. ENUMS (idempotent) ──
DO $$ BEGIN
  CREATE TYPE pre_order_status AS ENUM (
    'draft','pending_deposit','pending_doctor','scheduled','checked_in',
    'in_consult','decided','awaiting_confirmation','in_treatment','completed',
    'cancelled','rejected_full','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pre_order_item_status AS ENUM (
    'pending','approved','adjusted','rejected','fulfilled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deposit_entry_type AS ENUM (
    'deposit_received','applied_to_invoice','refund_pending','refunded',
    'converted_to_credit','forfeited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE doctor_decision AS ENUM ('approve','adjust','reject');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sales_channel AS ENUM (
    'line_oa','tiktok','facebook','instagram','walk_in','phone','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. SETTINGS (per clinic) — P1/P2/P3 ──
CREATE TABLE IF NOT EXISTS pre_order_settings (
  clinic_id               uuid PRIMARY KEY REFERENCES tenants(id),
  deposit_validity_days   int NOT NULL DEFAULT 90,                    -- P1
  expiry_action           text NOT NULL DEFAULT 'convert_to_credit'  -- P2
                          CHECK (expiry_action IN ('convert_to_credit','forfeit')),
  max_expiry_extensions   int NOT NULL DEFAULT 1,                     -- P2
  extension_days          int NOT NULL DEFAULT 30,
  min_deposit_amount      numeric(12,2) NOT NULL DEFAULT 500.00,      -- P3
  expiry_warning_days     int[] NOT NULL DEFAULT '{7,1}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── 3. CORE TABLES ──
CREATE TABLE IF NOT EXISTS pre_orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid NOT NULL REFERENCES tenants(id),
  branch_id              uuid,
  hn                     text NOT NULL REFERENCES patients(hn),
  status                 pre_order_status NOT NULL DEFAULT 'draft',

  -- Attribution (บังคับตั้งแต่สร้าง — ปิดช่องโหว่ commission)
  channel                sales_channel NOT NULL,
  affiliate_id           uuid REFERENCES affiliates(id),
  referral_code          text,

  -- Deposit lifecycle (P1/P2)
  deposit_expires_at     timestamptz,
  expiry_extension_count int NOT NULL DEFAULT 0 CHECK (expiry_extension_count >= 0),
  expiry_extended_at     timestamptz,
  expiry_extended_by     uuid,

  -- Linkage
  appointment_id         uuid REFERENCES appointments(id),
  vn                     text REFERENCES visits(vn),

  note                   text,
  created_by             uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_orders_clinic_status ON pre_orders (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_pre_orders_hn            ON pre_orders (hn);
CREATE INDEX IF NOT EXISTS idx_pre_orders_expiry        ON pre_orders (deposit_expires_at)
  WHERE status IN ('pending_doctor','scheduled');
CREATE INDEX IF NOT EXISTS idx_pre_orders_affiliate     ON pre_orders (affiliate_id)
  WHERE affiliate_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pre_order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_order_id          uuid NOT NULL REFERENCES pre_orders(id) ON DELETE CASCADE,
  service_id            uuid NOT NULL REFERENCES service_catalog(id),
  qty                   int NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_snapshot   numeric(12,2) NOT NULL,     -- P5: freeze ถาวร ณ วันขาย
  promo_ref             text,
  status                pre_order_item_status NOT NULL DEFAULT 'pending',

  -- Doctor Gate
  doctor_decision       doctor_decision,
  decision_reason       text,
  decided_by            uuid,
  decided_at            timestamptz,

  -- Change Order chain (Phase 2 — เตรียม field)
  replaced_by_item_id   uuid REFERENCES pre_order_items(id),
  treatment_record_id   uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- บังคับ reason เมื่อ adjust/reject
  CONSTRAINT reason_required CHECK (
    doctor_decision IS NULL OR doctor_decision = 'approve'
    OR (decision_reason IS NOT NULL AND length(trim(decision_reason)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_poi_pre_order ON pre_order_items (pre_order_id);

CREATE TABLE IF NOT EXISTS deposit_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES tenants(id),
  hn              text NOT NULL REFERENCES patients(hn),
  pre_order_id    uuid REFERENCES pre_orders(id),
  entry_type      deposit_entry_type NOT NULL,
  amount          numeric(12,2) NOT NULL,      -- +เพิ่ม liability / -ลด
  payment_method  text CHECK (payment_method IN ('cash','transfer','card','promptpay')),
  receipt_no      text,
  approved_by     uuid,                        -- บังคับสำหรับ refunded
  reason          text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refund_needs_approver CHECK (entry_type <> 'refunded' OR approved_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ledger_hn        ON deposit_ledger (hn);
CREATE INDEX IF NOT EXISTS idx_ledger_pre_order ON deposit_ledger (pre_order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_clinic    ON deposit_ledger (clinic_id, created_at);

CREATE TABLE IF NOT EXISTS pre_order_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES tenants(id),
  pre_order_id  uuid NOT NULL REFERENCES pre_orders(id),
  item_id       uuid REFERENCES pre_order_items(id),
  from_status   text,
  to_status     text NOT NULL,
  actor_id      uuid NOT NULL,
  actor_role    text NOT NULL,                 -- role label (staff/doctor/manager mapped → real role) หรือ 'system'
  reason        text,
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_audit ON pre_order_audit_log (pre_order_id, created_at);

-- ── 4. VIEW: credit balance ต่อคนไข้ (Patient Profile) ──
CREATE OR REPLACE VIEW patient_credit_balance AS
SELECT
  clinic_id,
  hn,
  COALESCE(SUM(CASE entry_type
      WHEN 'deposit_received'    THEN amount
      WHEN 'converted_to_credit' THEN 0
      WHEN 'applied_to_invoice'  THEN -abs(amount)
      WHEN 'refunded'            THEN -abs(amount)
      WHEN 'forfeited'           THEN -abs(amount)
      ELSE 0
    END), 0) AS balance
FROM deposit_ledger
GROUP BY clinic_id, hn;

-- ── 5. TRIGGERS ──
CREATE OR REPLACE FUNCTION fn_pre_order_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_pre_orders_updated ON pre_orders;
CREATE TRIGGER trg_pre_orders_updated BEFORE UPDATE ON pre_orders
  FOR EACH ROW EXECUTE FUNCTION fn_pre_order_touch_updated();

DROP TRIGGER IF EXISTS trg_po_settings_updated ON pre_order_settings;
CREATE TRIGGER trg_po_settings_updated BEFORE UPDATE ON pre_order_settings
  FOR EACH ROW EXECUTE FUNCTION fn_pre_order_touch_updated();

-- state transition guard (invariant ระดับ DB)
CREATE OR REPLACE FUNCTION fn_validate_pre_order_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
    WHEN 'draft'                 THEN NEW.status IN ('pending_deposit','cancelled')
    WHEN 'pending_deposit'       THEN NEW.status IN ('pending_doctor','cancelled')
    WHEN 'pending_doctor'        THEN NEW.status IN ('scheduled','checked_in','cancelled','expired')
    WHEN 'scheduled'             THEN NEW.status IN ('checked_in','cancelled','expired')
    WHEN 'checked_in'            THEN NEW.status IN ('in_consult')
    WHEN 'in_consult'            THEN NEW.status IN ('decided','rejected_full')
    WHEN 'decided'               THEN NEW.status IN ('awaiting_confirmation','in_treatment','rejected_full')
    WHEN 'awaiting_confirmation' THEN NEW.status IN ('in_treatment','cancelled')
    WHEN 'in_treatment'          THEN NEW.status IN ('completed')
    ELSE false   -- completed/cancelled/rejected_full/expired = terminal
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid pre_order transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pre_order_transition ON pre_orders;
CREATE TRIGGER trg_pre_order_transition BEFORE UPDATE OF status ON pre_orders
  FOR EACH ROW EXECUTE FUNCTION fn_validate_pre_order_transition();

-- ห้ามแก้ราคา snapshot/service/qty หลัง check-in (P5)
CREATE OR REPLACE FUNCTION fn_protect_pre_order_item()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_status pre_order_status;
BEGIN
  SELECT status INTO order_status FROM pre_orders WHERE id = NEW.pre_order_id;
  IF order_status NOT IN ('draft','pending_deposit','pending_doctor','scheduled') THEN
    IF NEW.unit_price_snapshot <> OLD.unit_price_snapshot
       OR NEW.service_id <> OLD.service_id OR NEW.qty <> OLD.qty THEN
      RAISE EXCEPTION 'Cannot modify item price/service/qty after check-in (status: %)', order_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_po_items ON pre_order_items;
CREATE TRIGGER trg_protect_po_items BEFORE UPDATE ON pre_order_items
  FOR EACH ROW EXECUTE FUNCTION fn_protect_pre_order_item();

-- ── 6. RLS (clinic isolation — pattern เดียวกับทั้งระบบ) ──
ALTER TABLE pre_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_order_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_order_settings  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_clinic ON pre_orders;
CREATE POLICY po_clinic ON pre_orders FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS poi_clinic ON pre_order_items;
CREATE POLICY poi_clinic ON pre_order_items FOR ALL TO authenticated
  USING (pre_order_id IN (SELECT id FROM pre_orders WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())))
  WITH CHECK (pre_order_id IN (SELECT id FROM pre_orders WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS ledger_clinic ON deposit_ledger;
CREATE POLICY ledger_clinic ON deposit_ledger FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS audit_clinic ON pre_order_audit_log;
CREATE POLICY audit_clinic ON pre_order_audit_log FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS settings_clinic ON pre_order_settings;
CREATE POLICY settings_clinic ON pre_order_settings FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── 7. SEED default settings ให้ทุก tenant ที่มีอยู่ (P1/P2/P3 ค่าเริ่มต้น) ──
INSERT INTO pre_order_settings (clinic_id)
SELECT id FROM tenants
ON CONFLICT (clinic_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT * FROM pre_order_settings;
--   \d pre_orders
-- ════════════════════════════════════════════════════════════
