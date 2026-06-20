-- ============================================================
-- 016_seed_tanavej_branches.sql
-- Seed Tanavej's first branch + backfill existing rows
--
-- ทำอะไร:
--   1) เพิ่ม 1 สาขา: ธนเวชคลินิก สาขาหลัก (CNX01, Chiang Mai, owned)
--   2) Backfill: UPDATE rows ที่ branch_id IS NULL ของทุกตาราง
--      ให้ชี้มาที่ CNX01 (เพราะตอนนี้มีสาขาเดียว)
--
-- ปลอดภัย:
--   - INSERT ใช้ ON CONFLICT DO NOTHING
--   - UPDATE มี WHERE branch_id IS NULL — ไม่แตะ row ที่มี branch_id อยู่แล้ว
--   - รันซ้ำได้ ไม่พัง
-- ============================================================

-- ── Constants ──
-- Tanavej tenant id : 11111111-1111-1111-1111-111111111111
-- CNX01 branch  id  : a1111111-1111-1111-1111-111111111111  (สร้างใหม่ที่นี่)

-- ────────────────────────────────────────────────────────────
-- 1. Seed branch
-- ────────────────────────────────────────────────────────────

INSERT INTO branches (
  id,
  clinic_id,
  branch_code,
  branch_name,
  branch_name_en,
  ownership_type,
  is_active,
  sort_order
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'CNX01',
  'สำนักงานใหญ่',
  'Tanavej Clinic — Headquarters',
  'owned',
  true,
  1
)
ON CONFLICT (clinic_id, branch_code) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill branch_id ของแถวเก่า (สาขาเดียว → ใส่ CNX01)
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_branch_id uuid := 'a1111111-1111-1111-1111-111111111111';
  v_clinic_id uuid := '11111111-1111-1111-1111-111111111111';
  v_tables    text[] := ARRAY[
    'visits','appointments','clinical_tasks','feedback_surveys',
    'inventory','stock_card','visit_supply_usage',
    'invoice_headers','slip_inbox','payment_logs','expenses',
    'queue_entries','session_logs','ip_allowlist','report_schedules'
  ];
  v_table     text;
  v_updated   int;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'UPDATE public.%I
          SET branch_id = $1
        WHERE clinic_id = $2
          AND branch_id IS NULL',
      v_table
    ) USING v_branch_id, v_clinic_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE '% : backfilled % row(s)', v_table, v_updated;
  END LOOP;

  -- staff.default_branch_id (ตารางนี้ใช้ default_branch_id ไม่ใช่ branch_id)
  UPDATE public.staff
     SET default_branch_id = v_branch_id
   WHERE clinic_id = v_clinic_id
     AND default_branch_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'staff : backfilled % row(s)', v_updated;
END $$;

-- ============================================================
-- Verification (รันแยกหลัง migrate):
--   SELECT id, branch_code, branch_name, ownership_type FROM branches;
--
--   -- เช็คว่าไม่มีแถวเก่าของ Tanavej ที่ branch_id ยังเป็น NULL
--   SELECT 'visits' AS t, count(*) FROM visits
--    WHERE clinic_id = '11111111-1111-1111-1111-111111111111' AND branch_id IS NULL
--   UNION ALL SELECT 'appointments', count(*) FROM appointments
--    WHERE clinic_id = '11111111-1111-1111-1111-111111111111' AND branch_id IS NULL
--   UNION ALL SELECT 'invoice_headers', count(*) FROM invoice_headers
--    WHERE clinic_id = '11111111-1111-1111-1111-111111111111' AND branch_id IS NULL;
--   -- ทุกบรรทัดควรเป็น 0
-- ============================================================

-- ✅ 016 done — Tanavej มี 1 สาขาแล้ว และข้อมูลเก่าถูกผูกเข้าสาขานี้
