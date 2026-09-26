-- ════════════════════════════════════════════════════════════
-- 141: สเปกการเงิน เฟส 2A — อัตราค่าตอบแทนแพทย์ (tenant setting + วันเริ่มใช้)
-- ════════════════════════════════════════════════════════════
--   doctor_hour_rate = ค่าชั่วโมงแพทย์ (บาท/ชม.) — ใช้กับแพทย์ที่ไม่ได้ตั้งเรทรายคน (staff.hourly_rate = 0)
--   df_doctor_pct    = DF แพทย์ % ของยอดสุทธิ เฉพาะรายการที่แพทย์ทำ (ใช้ในเฟส 2B)
-- ════════════════════════════════════════════════════════════

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
        ('df_doctor_pct', 7)
      ) AS d(k, v)
    ON CONFLICT (clinic_id, rate_key, effective_from) DO NOTHING
$$;

SELECT fn_seed_finance_rates(id) FROM tenants;
