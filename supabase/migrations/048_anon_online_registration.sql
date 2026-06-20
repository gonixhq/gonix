-- ════════════════════════════════════════════════════════════
-- 048: คลินิกนิรนาม เฟส 2 — ลงทะเบียนออนไลน์ + Verify Code + แบบประเมิน
-- ════════════════════════════════════════════════════════════
-- เพิ่มความสามารถ "ลงทะเบียนเองออนไลน์" (สแกน QR) ให้โมดูลนิรนาม:
--   - verify_code: รหัส 6 หลัก (ปกปิดตัวตน) อายุ 72 ชม.
--   - questionnaire: เก็บแบบประเมินความเสี่ยง (Screen 1-3) เป็น JSONB
--   - reg_channel: online (ลงทะเบียนเอง) / walkin (เจ้าหน้าที่ลงให้)
--   - public insert policy: ให้ผู้ใช้ที่ยังไม่ล็อกอิน (anon) สร้างได้เฉพาะแถว
--     reg_channel='online' + status='registered' เท่านั้น (อ่านไม่ได้ — กันความลับ)
-- ════════════════════════════════════════════════════════════

ALTER TABLE anon_cases
    ADD COLUMN IF NOT EXISTS verify_code      text,
    ADD COLUMN IF NOT EXISTS code_expires_at  timestamptz,
    ADD COLUMN IF NOT EXISTS reg_channel      text DEFAULT 'walkin',
    ADD COLUMN IF NOT EXISTS contact_email    text,
    ADD COLUMN IF NOT EXISTS contact_phone    text,
    ADD COLUMN IF NOT EXISTS questionnaire    jsonb;

-- case_code เดิมไม่บังคับแล้ว (online ใช้ verify_code เป็นหลัก)
ALTER TABLE anon_cases ALTER COLUMN case_code DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_anon_cases_verify
    ON anon_cases (clinic_id, verify_code) WHERE verify_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anon_cases_verify ON anon_cases (verify_code);

COMMENT ON COLUMN anon_cases.verify_code IS 'รหัสยืนยัน 6 หลัก (ปกปิดตัวตน) — ใช้เปิด Visit + เช็คผลออนไลน์';
COMMENT ON COLUMN anon_cases.code_expires_at IS 'รหัสหมดอายุเมื่อไหร่ (ลงทะเบียนออนไลน์ = +72 ชม.)';
COMMENT ON COLUMN anon_cases.questionnaire IS 'แบบประเมินความเสี่ยง/ข้อมูลพื้นฐาน (Screen 1-3) เก็บเป็น JSON';

-- ── Public INSERT policy (anon role) ──
-- ให้คนที่ยังไม่ล็อกอินสร้างเคสลงทะเบียนออนไลน์ได้ แต่ "อ่านไม่ได้"
DROP POLICY IF EXISTS anon_cases_public_insert ON anon_cases;
CREATE POLICY anon_cases_public_insert ON anon_cases
    FOR INSERT TO anon
    WITH CHECK (reg_channel = 'online' AND status = 'registered');

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT verify_code, reg_channel, code_expires_at, status,
--          questionnaire->>'gender_identity' AS gender
--     FROM anon_cases WHERE reg_channel = 'online';
-- ════════════════════════════════════════════════════════════
