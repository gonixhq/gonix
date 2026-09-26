-- ════════════════════════════════════════════════════════════
-- 151: สเปกการเงิน เฟส 5B — ฐานข้อมูลรายงานรายเดือน (เดือนปฏิทิน)
-- ════════════════════════════════════════════════════════════
-- fn_monthly_finance_metrics(clinic, from, to) → (period_month, metric, amount) · security invoker (เคารพ RLS)
--   รายได้ (หลักรับรู้เมื่อให้บริการ):
--     rev_aesthetic / rev_medical  = เงินรับจริงของรายการที่ไม่ใช่คอส (เกลี่ยส่วนลดท้ายบิล) + นิรนาม(เวชกรรม)
--     course_use_*                 = คอสที่ตัดใช้ในเดือน × มูลค่าต่อครั้ง (ราคาขายจริง)
--     breakage_*                   = คอสหมดอายุในเดือน (ครั้งที่เหลือ = รายได้คลินิก)
--     course_cash                  = เงินรับค่าคอสในเดือน (ข้อมูล — ยังไม่ใช่รายได้)
--   ต้นทุน: material · card_fee · waste · review_hand (ค่ามือเคสรีวิว = การตลาด) · ad_spend · petty_cash
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_monthly_finance_metrics(p_clinic uuid, p_from date, p_to date)
RETURNS TABLE (period_month text, metric text, amount numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH bounds AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Asia/Bangkok') AS s, ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Bangkok') AS e
),
lines AS (
    SELECT ii.id, ii.inv_id, ii.item_type, COALESCE(ii.segment, 'medical') AS segment,
        (COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) AS after_disc,
        SUM(COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) OVER (PARTITION BY ii.inv_id) AS inv_after
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    WHERE ih.clinic_id = p_clinic AND ih.status::text <> 'voided'
),
received AS (
    SELECT to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS pm, l.item_type, l.segment,
           l.after_disc * pl.amount / NULLIF(l.inv_after, 0) AS amt
      FROM lines l JOIN payment_logs pl ON pl.inv_id = l.inv_id, bounds b
     WHERE pl.paid_at >= b.s AND pl.paid_at < b.e AND l.inv_after > 0
),
uses AS (
    SELECT to_char((pu.used_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS pm, COALESCE(sp.segment, 'aesthetic') AS segment,
           COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0) AS val, pu.cost_material
      FROM package_usages pu
      JOIN patient_packages pp ON pp.id = pu.patient_package_id
      LEFT JOIN service_packages sp ON sp.id = pp.package_id, bounds b
     WHERE pu.clinic_id = p_clinic AND pu.used_at >= b.s AND pu.used_at < b.e
)
SELECT pm, 'rev_' || CASE WHEN segment = 'aesthetic' THEN 'aesthetic' ELSE 'medical' END, ROUND(SUM(amt), 2)
  FROM received WHERE item_type <> 'package' GROUP BY 1, 2
UNION ALL
SELECT pm, 'course_cash', ROUND(SUM(amt), 2) FROM received WHERE item_type = 'package' GROUP BY 1
UNION ALL
SELECT pm, 'course_use_' || CASE WHEN segment = 'aesthetic' THEN 'aesthetic' ELSE 'medical' END, ROUND(SUM(val), 2) FROM uses GROUP BY 1, 2
UNION ALL
SELECT pm, 'material', ROUND(SUM(COALESCE(cost_material, 0)), 2) FROM uses GROUP BY 1
UNION ALL
-- คอสหมดอายุในเดือน (ยังเหลือครั้ง) → รายได้
SELECT to_char((pp.expires_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'),
       'breakage_' || CASE WHEN COALESCE(sp.segment, 'aesthetic') = 'aesthetic' THEN 'aesthetic' ELSE 'medical' END,
       ROUND(SUM(COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0) * (pp.total_sessions - pp.used_sessions)), 2)
  FROM patient_packages pp LEFT JOIN service_packages sp ON sp.id = pp.package_id, bounds b
 WHERE pp.clinic_id = p_clinic AND pp.status NOT IN ('refunded', 'cancelled', 'completed')
   AND pp.total_sessions > pp.used_sessions AND pp.expires_at >= b.s AND pp.expires_at < b.e AND pp.expires_at < now()
 GROUP BY 1, 2
UNION ALL
-- คลินิกนิรนาม (เวชกรรม)
SELECT to_char((ac.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), 'rev_medical', ROUND(SUM(ac.total_amount), 2)
  FROM anon_cases ac, bounds b
 WHERE ac.clinic_id = p_clinic AND ac.paid AND ac.paid_at >= b.s AND ac.paid_at < b.e GROUP BY 1
UNION ALL
-- ต้นทุนยา/วัสดุตามบิล (วันลงบัญชี)
SELECT to_char(ih.invoice_date, 'YYYY-MM'), 'material', ROUND(SUM(COALESCE(ii.cost_material, 0)), 2)
  FROM invoice_items ii JOIN invoice_headers ih ON ih.id = ii.inv_id
 WHERE ih.clinic_id = p_clinic AND ih.status::text NOT IN ('voided', 'refunded') AND ih.invoice_date BETWEEN p_from AND p_to
 GROUP BY 1
UNION ALL
-- ค่ามือเคสรีวิว → การตลาด
SELECT to_char(ih.invoice_date, 'YYYY-MM'), 'review_hand', ROUND(SUM(COALESCE(ii.hand_fee_main, 0) + COALESCE(ii.hand_fee_asst, 0)), 2)
  FROM invoice_items ii JOIN invoice_headers ih ON ih.id = ii.inv_id
 WHERE ih.clinic_id = p_clinic AND ih.bill_type = 'review' AND ih.status::text NOT IN ('voided', 'refunded') AND ih.invoice_date BETWEEN p_from AND p_to
 GROUP BY 1
UNION ALL
-- ค่าธรรมเนียมบัตร (VAT ของค่าธรรมเนียม = ต้นทุน ถ้าคลินิกไม่ได้จด VAT)
SELECT to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), 'card_fee',
       ROUND(SUM(COALESCE(pl.card_fee, 0) + CASE WHEN COALESCE(public.fn_finance_rate(p_clinic, 'vat_enabled', (pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date), 0) = 1 THEN 0 ELSE COALESCE(pl.card_fee_vat, 0) END), 2)
  FROM payment_logs pl JOIN invoice_headers ih ON ih.id = pl.inv_id, bounds b
 WHERE ih.clinic_id = p_clinic AND ih.status::text <> 'voided' AND pl.paid_at >= b.s AND pl.paid_at < b.e AND pl.amount > 0
 GROUP BY 1
UNION ALL
SELECT to_char(w.wasted_on, 'YYYY-MM'), 'waste', ROUND(SUM(w.value), 2)
  FROM stock_waste w WHERE w.clinic_id = p_clinic AND w.wasted_on BETWEEN p_from AND p_to GROUP BY 1
UNION ALL
SELECT m.period_month, 'ad_spend', ROUND(SUM(m.amount), 2)
  FROM marketing_ad_spend m WHERE m.clinic_id = p_clinic AND m.period_month BETWEEN to_char(p_from, 'YYYY-MM') AND to_char(p_to, 'YYYY-MM') GROUP BY 1
UNION ALL
SELECT to_char(x.expense_date, 'YYYY-MM'), 'petty_cash', ROUND(SUM(x.amount), 2)
  FROM expenses x WHERE x.clinic_id = p_clinic AND x.expense_date BETWEEN p_from AND p_to GROUP BY 1
$$;
GRANT EXECUTE ON FUNCTION public.fn_monthly_finance_metrics(uuid, date, date) TO authenticated;
