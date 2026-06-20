-- ════════════════════════════════════════════════════════════
-- 027: Pending Registrations (Online Form / LINE OA)
-- ════════════════════════════════════════════════════════════
-- เก็บข้อมูลที่ผู้ป่วยลงทะเบียนล่วงหน้าผ่าน:
-- - Online form (เว็บคลินิก)
-- - LINE OA (LIFF / Rich Menu)
-- - Kiosk (อนาคต)
-- เมื่อผู้ป่วยมาถึงคลินิก เจ้าหน้าที่กดดึงข้อมูลแล้วยืนยันสร้าง patient record

CREATE TABLE IF NOT EXISTS pending_registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,

  -- Source tracking
  source        text NOT NULL DEFAULT 'online_form',  -- online_form | line_oa | kiosk
  line_user_id  text,
  ref_code      text,                                  -- รหัสอ้างอิงที่ใช้แลกข้อมูล

  -- Personal info
  prefix              text,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  first_name_en       text,
  last_name_en        text,
  dob                 date,
  gender              text,
  thai_id_card        text,
  passport_no         text,
  phone               text NOT NULL,
  email               text,
  blood_group         text,
  marital_status      text,
  occupation          text,
  race                text,
  nationality         text,

  -- Address
  address_detail      text,
  subdistrict_code    text,

  -- Medical (free-text from patient)
  allergy_summary     text,
  disease_summary     text,

  -- Insurance
  nhso_rights         text DEFAULT 'self_pay',
  nhso_main_hospital  text,

  -- Emergency contact
  emergency_contact_name      text,
  emergency_contact_phone     text,
  emergency_contact_relation  text,

  -- Consent
  pdpa_consent        boolean DEFAULT false,
  review_consent      boolean DEFAULT false,

  -- Status workflow
  status              text NOT NULL DEFAULT 'pending',  -- pending | approved | used | rejected
  converted_to_hn     text REFERENCES patients(hn) ON DELETE SET NULL,
  used_at             timestamptz,
  used_by             uuid REFERENCES profiles(id),

  -- Meta
  created_at          timestamptz DEFAULT (now() AT TIME ZONE 'Asia/Bangkok'),
  notes               text                            -- หมายเหตุจากเจ้าหน้าที่
);

CREATE INDEX IF NOT EXISTS idx_pending_reg_clinic  ON pending_registrations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_pending_reg_status  ON pending_registrations(status);
CREATE INDEX IF NOT EXISTS idx_pending_reg_phone   ON pending_registrations(phone);
CREATE INDEX IF NOT EXISTS idx_pending_reg_created ON pending_registrations(created_at DESC);

-- ── RLS ──
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_reg_clinic_isolation ON pending_registrations;
CREATE POLICY pending_reg_clinic_isolation ON pending_registrations
  FOR ALL
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- Allow anonymous INSERT — สำหรับ public registration page
-- ⚠️ Security: ควรเพิ่ม rate limit / CAPTCHA ใน production
DROP POLICY IF EXISTS pending_reg_public_insert ON pending_registrations;
CREATE POLICY pending_reg_public_insert ON pending_registrations
  FOR INSERT TO anon
  WITH CHECK (status = 'pending');

COMMENT ON TABLE pending_registrations IS 'ผู้ป่วยลงทะเบียนล่วงหน้าผ่าน Online form / LINE OA — รอเจ้าหน้าที่ดึงข้อมูลและสร้าง patient record';

-- ── SEED: ใส่ข้อมูลทดสอบ 3 ราย ──
-- (เปลี่ยน clinic_id ให้ตรงกับของคุณ — รัน SELECT id, clinic_name FROM tenants LIMIT 1; เพื่อหาค่า)
DO $$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT id INTO v_clinic_id FROM tenants LIMIT 1;
  IF v_clinic_id IS NOT NULL THEN
    INSERT INTO pending_registrations (
      clinic_id, source, prefix, first_name, last_name,
      dob, gender, thai_id_card, phone, email, blood_group,
      allergy_summary, disease_summary, nhso_rights,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      pdpa_consent
    ) VALUES
      (v_clinic_id, 'line_oa', 'นาย', 'อาทิตย์', 'สดใส',
       '1990-05-15', 'M', '1100800123456', '0812223333', 'arthit@gmail.com', 'O',
       'แพ้ Aspirin', NULL, 'self_pay',
       'นางมาลี สดใส', '0811112222', 'มารดา', true),
      (v_clinic_id, 'online_form', 'นางสาว', 'พิมพ์ใจ', 'รักดี',
       '1995-09-22', 'F', '1100800234567', '0823334444', NULL, 'B',
       NULL, 'หอบหืด', 'sso',
       'นายสมศักดิ์ รักดี', '0822223333', 'บิดา', true),
      (v_clinic_id, 'line_oa', 'นาย', 'วิทย์', 'เก่งกาจ',
       '1985-12-10', 'M', '1100800345678', '0834445555', 'wit@example.com', 'A',
       NULL, 'เบาหวาน · ความดัน', 'uc',
       'นางวันดี เก่งกาจ', '0833334444', 'ภรรยา', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
