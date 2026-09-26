-- ════════════════════════════════════════════════════════════
-- 147: สเปกการเงิน เฟส 3 — คอร์สค้างใช้ (มูลค่าคงเหลือ + ต้นทุนที่ยังต้องจ่าย)
-- ════════════════════════════════════════════════════════════
--   • patient_packages.net_price = ราคาที่ขายจริง "หลังส่วนลด" (paid_amount เดิมจาก checkout = ราคาก่อนลด)
--     backfill จากรายการในบิล (ส่วนลดรายการ + ส่วนลดท้ายบิลเกลี่ยตามสัดส่วน)
--   • service_packages.material_cost_per_session = ต้นทุนยา/วัสดุอื่นต่อครั้ง (ที่ไม่ได้ตัดสต๊อกอัตโนมัติ)
--   • v_package_liability: มูลค่าคงเหลือ = ราคาขายจริง ÷ ครั้ง × ครั้งที่เหลือ
--                          ต้นทุนที่ยังต้องจ่าย = (วัสดุ + วัสดุตัดสต๊อก × ราคาทุน + ค่ามือหลัก + ค่ามือผู้ช่วย) × ครั้งที่เหลือ
-- ════════════════════════════════════════════════════════════

ALTER TABLE patient_packages ADD COLUMN IF NOT EXISTS net_price numeric(12,2);
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS material_cost_per_session numeric(12,2);
COMMENT ON COLUMN patient_packages.net_price IS 'ราคาขายจริงหลังส่วนลด (ต่อคอส) — ใช้คิดมูลค่าคงเหลือ · null = ใช้ paid_amount';

-- backfill: คอสที่ขายผ่านบิล (จับคู่ item_ref_id = package_id) · bundle/ขายตรงที่ไม่ตรง → คงใช้ paid_amount
WITH li AS (
    SELECT ii.inv_id, ii.item_ref_id::text AS ref, GREATEST(1, floor(ii.qty))::numeric AS n,
        (COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) AS after_disc,
        SUM(COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) OVER (PARTITION BY ii.inv_id) AS inv_after
    FROM invoice_items ii
), per AS (
    SELECT li.inv_id, li.ref,
        ROUND(li.after_disc * ih.total_amount / NULLIF(li.inv_after, 0) / li.n, 2) AS net
    FROM li JOIN invoice_headers ih ON ih.id = li.inv_id
    WHERE li.ref IS NOT NULL
)
UPDATE patient_packages pp SET net_price = per.net
  FROM per
 WHERE pp.net_price IS NULL AND pp.invoice_id = per.inv_id AND pp.package_id::text = per.ref AND per.net IS NOT NULL;

CREATE OR REPLACE VIEW v_package_liability WITH (security_invoker = true) AS
SELECT
    pp.id, pp.clinic_id, pp.hn, pp.package_id, pp.package_name, sp.category,
    pp.total_sessions, pp.used_sessions, GREATEST(pp.total_sessions - pp.used_sessions, 0) AS remaining_sessions,
    pp.paid_amount, COALESCE(pp.net_price, pp.paid_amount) AS sale_price,
    pp.purchased_at, pp.expires_at, pp.status, pp.invoice_id,
    (pp.expires_at < now()) AS is_expired,
    GREATEST(0, EXTRACT(day FROM pp.expires_at - now())::int) AS days_remaining,
    ROUND(COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0), 2) AS value_per_session,
    ROUND(COALESCE(sp.material_cost_per_session, 0)
        + COALESCE(inv.cost_price, 0) * COALESCE(sp.consume_qty_per_session, 0)
        + COALESCE(sp.hand_fee_main, 0) + COALESCE(sp.hand_fee_asst, 0), 2) AS cost_per_session,
    ROUND(COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0)
        * GREATEST(pp.total_sessions - pp.used_sessions, 0), 2) AS remaining_value,
    ROUND((COALESCE(sp.material_cost_per_session, 0)
        + COALESCE(inv.cost_price, 0) * COALESCE(sp.consume_qty_per_session, 0)
        + COALESCE(sp.hand_fee_main, 0) + COALESCE(sp.hand_fee_asst, 0))
        * GREATEST(pp.total_sessions - pp.used_sessions, 0), 2) AS remaining_cost,
    CASE
        WHEN pp.status IN ('refunded','cancelled') THEN 'closed'
        WHEN pp.total_sessions - pp.used_sessions <= 0 OR pp.status = 'completed' THEN 'done'
        WHEN pp.status = 'expired' OR pp.expires_at < now() THEN 'expired_unused'
        ELSE 'outstanding'
    END AS liability_state
FROM patient_packages pp
LEFT JOIN service_packages sp ON sp.id = pp.package_id
LEFT JOIN inventory inv ON inv.id = sp.consume_item_id;

COMMENT ON VIEW v_package_liability IS 'คอร์สค้างใช้: มูลค่าคงเหลือ (ราคาขายจริง) + ต้นทุนที่ยังต้องจ่าย ต่อคอส · liability_state: outstanding/expired_unused/done/closed';
