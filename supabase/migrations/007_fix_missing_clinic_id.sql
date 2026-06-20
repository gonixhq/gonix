-- ============================================================
-- 007_fix_missing_clinic_id.sql  (ALL-IN-ONE FIX)
-- สร้าง tenant + running_numbers + link profiles ของ user จริง
-- ============================================================
-- วิธีใช้:
--   1. Copy SQL นี้ทั้งหมดไปวางใน Supabase SQL Editor
--   2. Run ทีเดียว — จบ!
-- ============================================================

-- ── Step A: สร้าง Tenant ถ้ายังไม่มี ──
INSERT INTO tenants (id, clinic_name, clinic_name_en, tax_id, primary_color)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'ธนเวชคลินิก',
    'Thanavej Clinic',
    NULL,
    '#2563EB'
) ON CONFLICT (id) DO NOTHING;

-- ── Step B: Running Numbers สำหรับ HN/VN/Queue/Invoice ──
INSERT INTO running_numbers (clinic_id, number_type, prefix, last_number, reset_period, last_reset_date)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'HN', 'HN-', 5, 'never', CURRENT_DATE),
    ('11111111-1111-1111-1111-111111111111', 'VN', 'VN-', 0, 'daily', CURRENT_DATE),
    ('11111111-1111-1111-1111-111111111111', 'QUEUE', 'A', 0, 'daily', CURRENT_DATE),
    ('11111111-1111-1111-1111-111111111111', 'INV', 'INV-', 0, 'monthly', CURRENT_DATE)
ON CONFLICT (clinic_id, number_type) DO NOTHING;

-- ── Step C: Link ทุก auth user ที่มี profile แต่ clinic_id = null ──
UPDATE profiles
SET clinic_id = '11111111-1111-1111-1111-111111111111',
    role = COALESCE(role, 'owner')
WHERE clinic_id IS NULL;

-- ── Step D: สร้าง profile สำหรับ auth users ที่ยังไม่มี profile เลย ──
INSERT INTO profiles (id, clinic_id, full_name, full_name_en, role)
SELECT
    au.id,
    '11111111-1111-1111-1111-111111111111',
    COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
    split_part(au.email, '@', 1),
    'owner'
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.id)
ON CONFLICT (id) DO NOTHING;

-- ── Step E: Sample Patients (5 คน) ──
INSERT INTO patients (hn, clinic_id, prefix, first_name, last_name, dob, gender, phone, thai_id_card, address_detail, subdistrict_code, occupation, first_visit_date)
VALUES
    ('HN-00001', '11111111-1111-1111-1111-111111111111', 'นาย', 'สมชาย', 'แสนดี', '1985-03-15', 'M', '0812345678', '1234567890123', '123 หมู่ 4', 'TH-000001', 'พนักงานบริษัท', CURRENT_DATE),
    ('HN-00002', '11111111-1111-1111-1111-111111111111', 'นาง', 'สมหญิง', 'ใจงาม', '1990-07-22', 'F', '0823456789', '2345678901234', '45/2 ซอย 5', 'TH-000035', 'แม่บ้าน', CURRENT_DATE),
    ('HN-00003', '11111111-1111-1111-1111-111111111111', 'น.ส.', 'วิภา', 'สุขสวัสดิ์', '1995-11-08', 'F', '0834567890', '3456789012345', '789 ถนนสุขุมวิท', 'TH-000126', 'นักศึกษา', CURRENT_DATE),
    ('HN-00004', '11111111-1111-1111-1111-111111111111', 'นาย', 'ธนากร', 'เจริญชัย', '1978-01-30', 'M', '0845678901', '4567890123456', '56/1 หมู่บ้านสุข', 'TH-000059', 'ค้าขาย', CURRENT_DATE),
    ('HN-00005', '11111111-1111-1111-1111-111111111111', 'ด.ช.', 'ภูมิ', 'ทรัพย์มาก', '2018-05-12', 'M', '0856789012', NULL, '99 คอนโด', 'TH-000070', 'นักเรียน', CURRENT_DATE)
ON CONFLICT (hn) DO NOTHING;

-- ── Step F: Sample Visit (วันนี้) ──
DO $$
DECLARE
    v_vn text;
BEGIN
    v_vn := 'VN-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-0001';

    INSERT INTO visits (vn, clinic_id, hn, visit_date, visit_type, chief_complaint, status)
    VALUES (v_vn, '11111111-1111-1111-1111-111111111111', 'HN-00001', CURRENT_DATE, 'opd', 'ปวดหัว มีไข้', 'waiting')
    ON CONFLICT (vn) DO NOTHING;

    INSERT INTO queue_entries (clinic_id, hn, vn, queue_number, queue_type, status, queue_date)
    VALUES ('11111111-1111-1111-1111-111111111111', 'HN-00001', v_vn, 'A0001', 'walk_in', 'waiting', CURRENT_DATE)
    ON CONFLICT DO NOTHING;
END $$;

-- ── Verify: ตรวจสอบผลลัพธ์ ──
SELECT 'tenants' as tbl, count(*) FROM tenants WHERE id = '11111111-1111-1111-1111-111111111111'
UNION ALL
SELECT 'profiles', count(*) FROM profiles WHERE clinic_id = '11111111-1111-1111-1111-111111111111'
UNION ALL
SELECT 'patients', count(*) FROM patients WHERE clinic_id = '11111111-1111-1111-1111-111111111111'
UNION ALL
SELECT 'running_numbers', count(*) FROM running_numbers WHERE clinic_id = '11111111-1111-1111-1111-111111111111';

-- ============================================================
-- ✅ ถ้า run สำเร็จ จะเห็นผลลัพธ์:
--   tenants: 1
--   profiles: 1+
--   patients: 5
--   running_numbers: 4
-- 
-- จากนั้น refresh หน้า patient form จะเห็น HN ขึ้นเลย!
-- ============================================================
