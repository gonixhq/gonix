-- ════════════════════════════════════════════════════════════
-- 148: สเปกการเงิน เฟส 4A — ต้นทุนหัตถการ (คลังยา → สูตรหัตถการ → รายการในบิล)
-- ════════════════════════════════════════════════════════════
--   • inventory.single_use = ใช้ครั้งเดียวทิ้ง → คิดเต็มแพ็ก/หลอด แม้ใช้ไม่หมด
--   • service_recipes = สูตรหัตถการ: เมนู → ยา/วัสดุ + จำนวนมาตรฐาน (ตัดสต๊อกตอนรับเงิน)
--   • service_catalog.doctor_hours = ชั่วโมงแพทย์มาตรฐานต่อเคส (ใช้ประเมินต้นทุน)
--   • invoice_items.cost_material / package_usages.cost_material = ต้นทุนยา/วัสดุจริง (snapshot ตอนออกบิล/ตัดคอส)
--   • finance_rates.margin_threshold_pct = เกณฑ์มาร์จิ้นขั้นต่ำ (35%)
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS single_use boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN inventory.single_use IS 'ใช้ครั้งเดียวทิ้ง — ต้นทุนคิดเต็มแพ็ก (units_per_pack) แม้ใช้ไม่หมด';
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS doctor_hours numeric(6,2);

CREATE TABLE IF NOT EXISTS service_recipes (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_id        uuid NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
    inventory_item_id uuid NOT NULL REFERENCES inventory(id),
    qty               numeric NOT NULL CHECK (qty > 0),
    cut_stock         boolean NOT NULL DEFAULT true,
    note              text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (service_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS idx_service_recipes_service ON service_recipes (service_id);
ALTER TABLE service_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_recipes_clinic ON service_recipes;
CREATE POLICY service_recipes_clinic ON service_recipes FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── ต้นทุนการใช้ของ 1 รายการ (ราคาทุนต่อหน่วยใช้ × จำนวน · ใช้ครั้งเดียวทิ้ง = ปัดขึ้นเต็มแพ็ก) ──
CREATE OR REPLACE FUNCTION public.fn_inv_use_cost(p_item uuid, p_qty numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT ROUND(COALESCE(i.cost_price, 0) * CASE
        WHEN i.single_use AND COALESCE(i.units_per_pack, 0) > 0 THEN ceil(COALESCE(p_qty, 0) / i.units_per_pack) * i.units_per_pack
        ELSE COALESCE(p_qty, 0) END, 2)
    FROM inventory i WHERE i.id = p_item
$$;

-- ── ต้นทุนวัสดุมาตรฐานของเมนู 1 ครั้ง (kit เดิม + สูตร) ──
CREATE OR REPLACE FUNCTION public.fn_service_material_cost(p_service uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT public.fn_inv_use_cost(sc.inventory_item_id, COALESCE(sc.consume_qty, 1))
                       FROM service_catalog sc WHERE sc.id = p_service AND sc.inventory_item_id IS NOT NULL), 0)
         + COALESCE((SELECT SUM(public.fn_inv_use_cost(r.inventory_item_id, r.qty)) FROM service_recipes r WHERE r.service_id = p_service), 0)
$$;
GRANT EXECUTE ON FUNCTION public.fn_inv_use_cost(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_service_material_cost(uuid) TO authenticated;

-- ── snapshot ต้นทุนวัสดุลงรายการในบิล ──
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS cost_material numeric(12,2);
CREATE OR REPLACE FUNCTION public.fn_invoice_item_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref text := NEW.item_ref_id::text; v_inv uuid;
BEGIN
    IF v_ref IS NULL OR NEW.cost_material IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.item_type = 'package' THEN NEW.cost_material := 0; RETURN NEW; END IF;   -- คอส: ต้นทุนเกิดตอนตัดใช้
    IF EXISTS (SELECT 1 FROM service_catalog WHERE id::text = v_ref) THEN
        NEW.cost_material := ROUND(public.fn_service_material_cost(v_ref::uuid) * COALESCE(NEW.qty, 1), 2);
        RETURN NEW;
    END IF;
    SELECT id INTO v_inv FROM inventory WHERE id::text = v_ref;
    IF v_inv IS NULL THEN SELECT item_id INTO v_inv FROM drug_orders WHERE id::text = v_ref; END IF;
    IF v_inv IS NOT NULL THEN NEW.cost_material := public.fn_inv_use_cost(v_inv, NEW.qty); END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_item_cost ON invoice_items;
CREATE TRIGGER trg_invoice_item_cost BEFORE INSERT ON invoice_items FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_item_cost();

-- ── snapshot ต้นทุนวัสดุตอนตัดคอส ──
ALTER TABLE package_usages ADD COLUMN IF NOT EXISTS cost_material numeric(12,2);
CREATE OR REPLACE FUNCTION public.fn_package_usage_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.cost_material IS NOT NULL THEN RETURN NEW; END IF;
    SELECT ROUND(COALESCE(sp.material_cost_per_session, 0)
         + COALESCE(public.fn_inv_use_cost(sp.consume_item_id, sp.consume_qty_per_session), 0), 2)
      INTO NEW.cost_material
      FROM patient_packages pp JOIN service_packages sp ON sp.id = pp.package_id
     WHERE pp.id = NEW.patient_package_id;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_package_usage_cost ON package_usages;
CREATE TRIGGER trg_package_usage_cost BEFORE INSERT ON package_usages FOR EACH ROW EXECUTE FUNCTION public.fn_package_usage_cost();

-- ── backfill บิล/การตัดคอสเดิม ด้วยราคาทุนปัจจุบัน (ประมาณการ — ของใหม่จะเป็นราคา ณ วันขาย) ──
UPDATE invoice_items ii SET cost_material = CASE
        WHEN ii.item_type = 'package' THEN 0
        WHEN EXISTS (SELECT 1 FROM service_catalog sc WHERE sc.id::text = ii.item_ref_id::text)
            THEN ROUND(public.fn_service_material_cost(ii.item_ref_id::uuid) * COALESCE(ii.qty, 1), 2)
        ELSE public.fn_inv_use_cost(COALESCE(
            (SELECT i.id FROM inventory i WHERE i.id::text = ii.item_ref_id::text),
            (SELECT d.item_id FROM drug_orders d WHERE d.id::text = ii.item_ref_id::text)), ii.qty)
    END
 WHERE ii.cost_material IS NULL AND ii.item_ref_id IS NOT NULL;
UPDATE package_usages pu SET cost_material = (
    SELECT ROUND(COALESCE(sp.material_cost_per_session, 0) + COALESCE(public.fn_inv_use_cost(sp.consume_item_id, sp.consume_qty_per_session), 0), 2)
      FROM patient_packages pp JOIN service_packages sp ON sp.id = pp.package_id WHERE pp.id = pu.patient_package_id)
 WHERE pu.cost_material IS NULL;

-- ── เกณฑ์มาร์จิ้น ──
CREATE OR REPLACE FUNCTION fn_seed_finance_rates(p_clinic uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    INSERT INTO finance_rates (clinic_id, rate_key, rate_value, effective_from, note)
    SELECT p_clinic, k, v, DATE '2000-01-01', 'ค่าเริ่มต้นตามสเปก'
      FROM (VALUES
        ('mdr_debit_domestic', 0.50),
        ('mdr_credit_domestic', 1.60),
        ('mdr_credit_domestic_premium', 2.40),
        ('mdr_foreign', 2.25),
        ('mdr_foreign_premium', 3.10),
        ('mdr_kbank', 1.60),
        ('card_fee_vat_pct', 7),
        ('installment_interest_pct_month', 0.65),
        ('vat_enabled', 0),
        ('doctor_hour_rate', 750),
        ('df_doctor_pct', 7),
        ('ref_comm_pct', 3),
        ('ref_lapse_months', 12),
        ('team_w_nurse', 2),
        ('team_w_marketing', 2),
        ('team_w_assistant', 1),
        ('team_w_front', 1),
        ('team_w_general', 0.5),
        ('margin_threshold_pct', 35)
      ) AS d(k, v)
    ON CONFLICT (clinic_id, rate_key, effective_from) DO NOTHING
$$;
SELECT fn_seed_finance_rates(id) FROM tenants;
