-- ════════════════════════════════════════════════════════════
-- 117: ตรรกะตัด vial (P04 — model B: open-then-share + FEFO + กัน race)
-- ════════════════════════════════════════════════════════════
-- ตัดตอน "คิดเงิน" ตามยอดบิล (สต๊อก=รายได้) · หมอบันทึกเป็น cross-check (P06)
--
-- fn_deduct_vials(clinic, item, qty):
--   1. ตัดจาก vial ที่ 'open' อยู่ก่อน (เปิดก่อน=ใช้ก่อน) — FOR UPDATE ล็อกแถว
--   2. ไม่พอ → เปิด vial 'unopened' ทีละขวด FEFO (หมดอายุใกล้สุดก่อน) — FOR UPDATE
--   3. capacity_remaining ถึง 0 → depleted
--   4. vial ไม่พอ → RAISE (rollback, สต๊อกไม่ติดลบ)
--   คืน jsonb ว่าตัดจาก vial/lot ไหนเท่าไหร่ (ไว้ trace/recall + reconcile)
-- FOR UPDATE (READ COMMITTED + EvalPlanQual) → สองห้องตัดขวดเดียวกันพร้อมกัน
--   ถูก serialize + re-check qual → ไม่ตัดทับกัน ไม่ติดลบ
-- ════════════════════════════════════════════════════════════

-- sync inventory.stock_qty ของ item ฉีด = ผลรวม capacity_remaining ที่ยังไม่ depleted
CREATE OR REPLACE FUNCTION fn_sync_vial_stock(p_item uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE inventory
       SET stock_qty = COALESCE((
               SELECT sum(capacity_remaining) FROM inventory_vials
                WHERE item_id = p_item AND status <> 'depleted'), 0),
           updated_at = now()
     WHERE id = p_item;
END $$;

CREATE OR REPLACE FUNCTION fn_deduct_vials(p_clinic uuid, p_item uuid, p_qty numeric)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_remaining numeric := p_qty;
    v_take numeric;
    v_used jsonb := '[]'::jsonb;
    v_row inventory_vials%ROWTYPE;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RETURN jsonb_build_object('ok', true, 'used', v_used);
    END IF;

    -- 1) ตัดจากขวดที่เปิดค้างอยู่ก่อน (เปิดก่อน=ใช้ก่อน)
    FOR v_row IN
        SELECT * FROM inventory_vials
         WHERE clinic_id = p_clinic AND item_id = p_item
           AND status = 'open' AND capacity_remaining > 0
         ORDER BY opened_at NULLS LAST, received_at
         FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := least(v_row.capacity_remaining, v_remaining);
        UPDATE inventory_vials
           SET capacity_remaining = capacity_remaining - v_take,
               status = CASE WHEN capacity_remaining - v_take <= 0 THEN 'depleted' ELSE 'open' END
         WHERE id = v_row.id;
        v_used := v_used || jsonb_build_object('vial_id', v_row.id, 'lot', v_row.lot_number, 'qty', v_take);
        v_remaining := v_remaining - v_take;
    END LOOP;

    -- 2) ยังไม่พอ → เปิดขวดใหม่ทีละขวด FEFO (หมดอายุใกล้สุดก่อน)
    WHILE v_remaining > 0 LOOP
        SELECT * INTO v_row FROM inventory_vials
         WHERE clinic_id = p_clinic AND item_id = p_item AND status = 'unopened'
         ORDER BY expiry_date NULLS LAST, received_at
         LIMIT 1
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'INSUFFICIENT_VIAL_STOCK: item % ขาด % หน่วย', p_item, v_remaining;
        END IF;
        v_take := least(v_row.capacity_total, v_remaining);
        UPDATE inventory_vials
           SET status = CASE WHEN v_take >= v_row.capacity_total THEN 'depleted' ELSE 'open' END,
               capacity_remaining = v_row.capacity_total - v_take,
               opened_at = now()
         WHERE id = v_row.id;
        v_used := v_used || jsonb_build_object('vial_id', v_row.id, 'lot', v_row.lot_number, 'qty', v_take);
        v_remaining := v_remaining - v_take;
    END LOOP;

    PERFORM fn_sync_vial_stock(p_item);
    RETURN jsonb_build_object('ok', true, 'used', v_used);
END $$;

GRANT EXECUTE ON FUNCTION fn_sync_vial_stock(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION fn_deduct_vials(uuid, uuid, numeric) TO authenticated;

-- ════════════════════════════════════════════════════════════
-- Verification (ทดสอบ open-then-share + FEFO + กัน race):
--   -- ใส่ 2 ขวดทดสอบ (100u หมดอายุคนละวัน) แล้ว
--   SELECT fn_deduct_vials('<clinic>','<item>', 120);
--   -- → ตัดขวดหมดอายุใกล้สุดจนหมด (100) + เปิดขวดถัดไปตัด 20 · เหลือ 80 · stock_qty=80
--   -- ยิงพร้อมกัน 2 session จากขวดเดียว → รวมตัดไม่เกินที่มี ไม่ติดลบ
-- ════════════════════════════════════════════════════════════
