-- ============================================================
-- 006_seed_thanavej_clinic.sql
-- Seed data for ธนเวชคลินิก (Thanavej Clinic)
-- ============================================================
--
-- ⚠️ INSTRUCTIONS:
--   1. Run migrations 001-005 first in Supabase SQL Editor
--   2. Create a user via Supabase Auth Dashboard:
--      - Go to Authentication → Users → Add User
--      - Email: admin@thanavej.clinic (or your real email)
--      - Password: your choice
--   3. Copy the user UUID from Auth → Users table
--   4. Replace <YOUR_AUTH_USER_UUID> below with that UUID
--   5. Run this file in SQL Editor
-- ============================================================

-- ── 1. Create Tenant (Clinic) ──
INSERT INTO tenants (id, clinic_name, clinic_name_en, tax_id, primary_color)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'ธนเวชคลินิก',
    'Thanavej Clinic',
    NULL,
    '#2563EB'
) ON CONFLICT (id) DO NOTHING;

-- ── 2. Running Numbers (for HN/VN generation) ──
INSERT INTO running_numbers (clinic_id, number_type, prefix, last_number, reset_period, last_reset_date)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'HN', 'HN-', 5, 'never', CURRENT_DATE),
    ('11111111-1111-1111-1111-111111111111', 'VN', 'VN-', 0, 'daily', CURRENT_DATE),
    ('11111111-1111-1111-1111-111111111111', 'QUEUE', 'A', 0, 'daily', CURRENT_DATE),
    ('11111111-1111-1111-1111-111111111111', 'INV', 'INV-', 0, 'monthly', CURRENT_DATE)
ON CONFLICT (clinic_id, number_type) DO NOTHING;

-- ── 3. Profile for Admin ──
--
-- ⚠️ REPLACE THIS UUID with the Auth user UUID you created in step 2-3
--    Go to Supabase Dashboard → Authentication → Users → copy the user's UUID
--
INSERT INTO profiles (id, clinic_id, full_name, full_name_en, role, phone)
VALUES (
    '414b8fc0-4525-4cde-b3d3-52fbd5f34432',   -- ← REPLACE THIS!
    '11111111-1111-1111-1111-111111111111',
    'ผู้ดูแลระบบ',
    'System Admin',
    'owner',
    '0891234567'
);

-- ── 4. Staff record for the admin ──
INSERT INTO staff (id, profile_id, clinic_id, employee_code, license_number)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '414b8fc0-4525-4cde-b3d3-52fbd5f34432',   -- ← MUST MATCH profiles.id above
    '11111111-1111-1111-1111-111111111111',
    'EMP-001',
    NULL
);

-- ── 5. Sample Patients (5 คน) ──
INSERT INTO patients (hn, clinic_id, prefix, first_name, last_name, dob, gender, phone, thai_id_card, address_detail, subdistrict_code, occupation, first_visit_date)
VALUES
    ('HN-00001', '11111111-1111-1111-1111-111111111111', 'นาย', 'สมชาย', 'แสนดี', '1985-03-15', 'M', '0812345678', '1234567890123', '123 หมู่ 4', 'TH-000001', 'พนักงานบริษัท', CURRENT_DATE),
    ('HN-00002', '11111111-1111-1111-1111-111111111111', 'นาง', 'สมหญิง', 'ใจงาม', '1990-07-22', 'F', '0823456789', '2345678901234', '45/2 ซอย 5', 'TH-000035', 'แม่บ้าน', CURRENT_DATE),
    ('HN-00003', '11111111-1111-1111-1111-111111111111', 'น.ส.', 'วิภา', 'สุขสวัสดิ์', '1995-11-08', 'F', '0834567890', '3456789012345', '789 ถนนสุขุมวิท', 'TH-000126', 'นักศึกษา', CURRENT_DATE),
    ('HN-00004', '11111111-1111-1111-1111-111111111111', 'นาย', 'ธนากร', 'เจริญชัย', '1978-01-30', 'M', '0845678901', '4567890123456', '56/1 หมู่บ้านสุข', 'TH-000059', 'ค้าขาย', CURRENT_DATE),
    ('HN-00005', '11111111-1111-1111-1111-111111111111', 'ด.ช.', 'ภูมิ', 'ทรัพย์มาก', '2018-05-12', 'M', '0856789012', NULL, '99 คอนโด', 'TH-000070', 'นักเรียน', CURRENT_DATE)
ON CONFLICT (hn) DO NOTHING;

-- ── 6. Sample Visit (วันนี้) ──
DO $$
DECLARE
    v_vn text;
BEGIN
    v_vn := 'VN-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-0001';

    INSERT INTO visits (vn, clinic_id, hn, visit_date, visit_type, chief_complaint, status)
    VALUES (v_vn, '11111111-1111-1111-1111-111111111111', 'HN-00001', CURRENT_DATE, 'opd', 'ปวดหัว มีไข้', 'waiting')
    ON CONFLICT (vn) DO NOTHING;

    INSERT INTO queue_entries (clinic_id, hn, vn, queue_number, queue_type, status, queue_date)
    VALUES ('11111111-1111-1111-1111-111111111111', 'HN-00001', v_vn, 'A0001', 'walk_in', 'waiting', CURRENT_DATE);

    -- Update VN running number
    UPDATE running_numbers SET last_number = 1
    WHERE clinic_id = '11111111-1111-1111-1111-111111111111' AND number_type = 'VN';
END $$;

-- ============================================================
-- ✅ DONE! Next steps:
--   1. Login with the email/password you created
--   2. Dashboard should show 5 patients and 1 visit
--   3. Try creating a new patient + test tambon auto-fill
--   4. Try creating a new visit from the visits page
-- ============================================================
