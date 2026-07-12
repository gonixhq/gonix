-- ════════════════════════════════════════════════════════════
-- RLS Audit — ไล่เช็คความปลอดภัยระดับแถว (Row Level Security)
-- ════════════════════════════════════════════════════════════
-- วิธีใช้: เปิด Supabase → SQL Editor (หรือ pgAdmin) แล้วรันทีละ query
-- ควรรันซ้ำหลังเพิ่ม migration ใหม่ทุกครั้ง (multi-tenant = RLS ต้องครบ 100%)
-- ════════════════════════════════════════════════════════════

-- ── [1] 🔴 ตารางที่ RLS "ปิดอยู่" (client อ่าน/เขียนข้ามคลินิกได้ = รั่ว) ──
--     ผลลัพธ์ควรเป็น "0 rows" — ถ้ามีตาราง ต้องเปิด RLS + เขียน policy ทันที
--     ยกเว้นตารางที่ตั้งใจให้เข้าถึงผ่าน security-definer function เท่านั้น
--     (เช่น anon_result_rl) — แต่ก็ควรเปิด RLS ไว้กันพลาด
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND NOT c.relrowsecurity
ORDER BY c.relname;

-- ── [2] 🟠 ตารางที่เปิด RLS แล้ว แต่ "ไม่มี policy เลย" ──
--     = ไม่มีใครเข้าถึงได้ (อาจตั้งใจ = ผ่าน definer function เท่านั้น)
--       หรือลืมเขียน policy → ตรวจว่าตั้งใจหรือพลาด
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relrowsecurity
GROUP BY c.relname
HAVING count(p.polname) = 0
ORDER BY c.relname;

-- ── [3] ℹ️ สรุปจำนวน policy ต่อตาราง (ดูภาพรวม / หาตารางที่ policy น้อยผิดปกติ) ──
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policies ASC, tablename;

-- ── [4] 🟠 ตารางที่มี policy แต่ "ไม่ได้กรอง clinic_id" (เสี่ยงข้ามคลินิก) ──
--     ไล่ดู qual/with_check ว่ามีเงื่อนไข clinic_id ไหม — ตารางที่ผูกคลินิกควรมี
SELECT tablename, policyname, cmd,
       (qual ILIKE '%clinic_id%' OR with_check ILIKE '%clinic_id%') AS has_clinic_filter
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY has_clinic_filter ASC, tablename, policyname;

-- ── [5] ℹ️ SECURITY DEFINER functions (bypass RLS ได้ — ต้อง review ให้ปลอดภัย) ──
--     เช็คว่าตั้ง search_path (กัน search_path hijack) และตรวจสิทธิ์ภายในเอง
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       (p.proconfig::text ILIKE '%search_path%') AS has_search_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY has_search_path ASC, p.proname;

-- ── [6] 🔴 ตาราง public ที่ให้สิทธิ์ anon/authenticated แบบกว้าง (GRANT ตรง) ──
--     ควรเข้าถึงผ่าน RLS policy ไม่ใช่ GRANT ระดับตารางให้ anon
SELECT table_name, grantee, string_agg(privilege_type, ', ') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY grantee, table_name;
