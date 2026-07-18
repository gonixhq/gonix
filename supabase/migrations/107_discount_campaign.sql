-- ════════════════════════════════════════════════════════════
-- 107: ระบบส่วนลด + แคมเปญ/โค้ดโปรโมชัน
-- ════════════════════════════════════════════════════════════
-- เดิม: ลดได้แค่ยอดรวมท้ายบิลก้อนเดียว (invoice_headers.discount_amount)
--       ไม่รู้ว่าลดเพราะอะไร ใครอนุมัติ มาจากแคมเปญไหน → report ไม่ได้
-- ใหม่: • ส่วนลดรายรายการ (invoice_items.discount_amount)
--       • breakdown ทุกก้อน (invoice_discounts) พร้อม type/source/approved_by
--       • แคมเปญ/โค้ดพร้อมเงื่อนไข (campaigns) + ผูก channel + จำกัดการใช้
-- หมายเหตุ: invoice_headers.discount_amount ยังเป็น "ยอดลดรวมทั้งบิล" เหมือนเดิม
--           (ไม่ต้องแก้โค้ดรายงานเดิม) — invoice_discounts เป็นรายละเอียดเสริม
-- ════════════════════════════════════════════════════════════

-- ── 1. ส่วนลดรายรายการ ──
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN invoice_items.discount_amount IS 'ส่วนลดเฉพาะรายการนี้ (บาท) — line_total หักแล้ว';

-- ── 2. แคมเปญ / โค้ดโปรโมชัน ──
CREATE TABLE IF NOT EXISTS campaigns (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id               uuid NOT NULL REFERENCES tenants(id),
  code                    text NOT NULL,                       -- โค้ดที่เคาน์เตอร์กรอก (เก็บเป็นตัวพิมพ์ใหญ่)
  name                    text NOT NULL,                       -- ชื่อแคมเปญ (แสดงในใบเสร็จ/รายงาน)

  discount_type           text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value          numeric NOT NULL CHECK (discount_value > 0),
  max_discount_amount     numeric,                             -- เพดานเมื่อเป็น percent (null = ไม่จำกัด)
  min_purchase            numeric NOT NULL DEFAULT 0,          -- ยอดขั้นต่ำถึงใช้ได้

  -- ใช้ได้กับรายการประเภทไหน ('all' = ทั้งบิล)
  applies_to              text NOT NULL DEFAULT 'all'
                          CHECK (applies_to IN ('all','service','drug','package','lab')),

  channel                 text,                                -- attribution: line_oa/tiktok/facebook/...
  starts_at               date,
  ends_at                 date,
  usage_limit             int CHECK (usage_limit IS NULL OR usage_limit > 0),        -- ทั้งแคมเปญใช้ได้กี่ครั้ง
  usage_limit_per_patient int NOT NULL DEFAULT 1 CHECK (usage_limit_per_patient > 0),
  is_active               bool NOT NULL DEFAULT true,

  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT campaign_date_order CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at),
  CONSTRAINT percent_range CHECK (discount_type <> 'percent' OR discount_value <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_code ON campaigns (clinic_id, upper(code));
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns (clinic_id, is_active);

-- ── 3. Breakdown ส่วนลดต่อบิล (foundation ของ report/audit) ──
CREATE TABLE IF NOT EXISTS invoice_discounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES tenants(id),
  inv_id          text NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  inv_item_id     uuid REFERENCES invoice_items(id) ON DELETE CASCADE,  -- null = ส่วนลดท้ายบิล

  discount_type   text NOT NULL CHECK (discount_type IN ('campaign','manual','package','staff_benefit')),
  discount_source text,                                  -- ชื่อโค้ด / เหตุผลที่พิมพ์เอง
  campaign_id     uuid REFERENCES campaigns(id),
  amount          numeric NOT NULL CHECK (amount >= 0),

  approved_by     uuid,                                  -- ใครอนุมัติ (manual ที่เกินเพดาน)
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- ส่วนลดจากแคมเปญต้องอ้างแคมเปญเสมอ (กันบันทึกลอย)
  CONSTRAINT campaign_needs_ref CHECK (discount_type <> 'campaign' OR campaign_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_inv_disc_inv      ON invoice_discounts (inv_id);
CREATE INDEX IF NOT EXISTS idx_inv_disc_campaign ON invoice_discounts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_inv_disc_clinic   ON invoice_discounts (clinic_id, created_at);

-- ── 4. ผูกแคมเปญกับบิล (เสริมจาก invoice_headers.campaign text เดิมของ mig 086) ──
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_invoice_campaign_id ON invoice_headers (clinic_id, campaign_id) WHERE campaign_id IS NOT NULL;

-- ── 5. VIEW: ผลงานแคมเปญ (นับเฉพาะบิลที่ไม่ถูกยกเลิก/คืนเงิน) ──
CREATE OR REPLACE VIEW v_campaign_performance AS
SELECT
  c.id                                      AS campaign_id,
  c.clinic_id,
  c.code,
  c.name,
  c.channel,
  COUNT(DISTINCT h.id)                      AS invoice_count,
  COUNT(DISTINCT h.hn)                      AS unique_patients,
  COALESCE(SUM(d.amount), 0)                AS discount_total,
  COALESCE(SUM(DISTINCT h.subtotal), 0)     AS gross_before_discount,
  COALESCE(SUM(DISTINCT h.paid_amount), 0)  AS net_revenue,
  MIN(h.invoice_date)                       AS first_used,
  MAX(h.invoice_date)                       AS last_used
FROM campaigns c
LEFT JOIN invoice_discounts d ON d.campaign_id = c.id
LEFT JOIN invoice_headers   h ON h.id = d.inv_id AND h.status NOT IN ('voided','refunded')
GROUP BY c.id, c.clinic_id, c.code, c.name, c.channel;

-- ── 6. RLS (pattern เดียวกับตารางอื่น: clinic-scoped, FOR ALL) ──
ALTER TABLE campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_clinic ON campaigns;
CREATE POLICY campaigns_clinic ON campaigns FOR ALL TO authenticated
  USING      (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS invoice_discounts_clinic ON invoice_discounts;
CREATE POLICY invoice_discounts_clinic ON invoice_discounts FOR ALL TO authenticated
  USING      (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── 7. trigger updated_at ──
CREATE OR REPLACE FUNCTION fn_campaigns_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_campaigns_updated ON campaigns;
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION fn_campaigns_touch();
