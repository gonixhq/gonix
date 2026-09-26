-- ════════════════════════════════════════════════════════════
-- 156: วันเกิดคนไข้ — แจ้งเตือน + ส่ง HBD + คูปองวันเกิด
-- ════════════════════════════════════════════════════════════
--   • tenants.birthday_message = ข้อความอวยพรของคลินิก ({name} {nickname} {clinic} แทนค่าได้)
--   • birthday_greetings = log การส่งอวยพร (ปีละครั้งต่อคน · LINE หรือคัดลอกส่งเอง)
--   • patient_coupons = คูปองของคนไข้ (วันเกิด ตอนนี้ · อนาคต: แลกแต้ม/แลกคะแนน)
--     มูลค่ายังตั้งทีหลังได้ (discount_mode = null) · ใช้ได้เฉพาะฝั่งความงาม
-- ════════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS birthday_message text;

CREATE TABLE IF NOT EXISTS birthday_greetings (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hn         text NOT NULL REFERENCES patients(hn),
    year       int NOT NULL,
    channel    text NOT NULL CHECK (channel IN ('line','manual')),
    message    text,
    sent_by    uuid REFERENCES profiles(id),
    sent_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_birthday_greetings ON birthday_greetings (clinic_id, year, hn);
ALTER TABLE birthday_greetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS birthday_greetings_clinic ON birthday_greetings;
CREATE POLICY birthday_greetings_clinic ON birthday_greetings FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS patient_coupons (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hn               text NOT NULL REFERENCES patients(hn),
    kind             text NOT NULL CHECK (kind IN ('birthday','points','manual')),
    title            text NOT NULL,
    discount_mode    text CHECK (discount_mode IS NULL OR discount_mode IN ('pct','fixed')),   -- null = ยังไม่ได้ตั้งมูลค่า
    discount_value   numeric(12,2),
    max_discount     numeric(12,2),
    applies_to       text NOT NULL DEFAULT 'aesthetic' CHECK (applies_to IN ('aesthetic','all')),
    valid_from       date NOT NULL,
    valid_until      date NOT NULL,
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','used','expired','cancelled')),
    source_year      int,               -- คูปองวันเกิด: ปีที่ออก (กันออกซ้ำ)
    used_invoice_id  text REFERENCES invoice_headers(id),
    used_at          timestamptz,
    note             text,
    created_by       uuid REFERENCES profiles(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT patient_coupons_valid_chk CHECK (valid_until >= valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_coupons_birthday ON patient_coupons (clinic_id, hn, source_year) WHERE kind = 'birthday';
CREATE INDEX IF NOT EXISTS idx_patient_coupons_hn ON patient_coupons (clinic_id, hn, status);
ALTER TABLE patient_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_coupons_clinic ON patient_coupons;
CREATE POLICY patient_coupons_clinic ON patient_coupons FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── คนไข้ที่วันเกิดตรงช่วงวัน [p_from, p_to] (ข้ามปีได้ · 29 ก.พ. ปีปกติ = 28 ก.พ.) · เคารพ RLS ──
CREATE OR REPLACE FUNCTION public.fn_birthdays_between(p_from date, p_to date)
RETURNS TABLE (hn text, prefix text, first_name text, last_name text, nickname text, phone text,
               dob date, has_line boolean, bday date, age int, last_visit date)
LANGUAGE sql STABLE SET search_path = public AS $$
    WITH p AS (
        SELECT pt.*, y.yr,
               make_date(y.yr, extract(month FROM pt.dob)::int,
                   LEAST(extract(day FROM pt.dob)::int,
                         extract(day FROM (make_date(y.yr, extract(month FROM pt.dob)::int, 1) + interval '1 month - 1 day'))::int)) AS bd
          FROM patients pt
          CROSS JOIN (SELECT generate_series(extract(year FROM p_from)::int, extract(year FROM p_to)::int) AS yr) y
         WHERE pt.dob IS NOT NULL
    )
    SELECT p.hn, p.prefix, p.first_name, p.last_name, p.nickname, p.phone, p.dob,
           (p.line_user_id IS NOT NULL) AS has_line, p.bd,
           (p.yr - extract(year FROM p.dob)::int) AS age,
           p.last_visit_date
      FROM p
     WHERE p.bd BETWEEN p_from AND p_to
     ORDER BY p.bd, p.first_name
$$;
GRANT EXECUTE ON FUNCTION public.fn_birthdays_between(date, date) TO authenticated;
