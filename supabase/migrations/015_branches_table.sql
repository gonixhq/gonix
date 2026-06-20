-- ============================================================
-- 015_branches_table.sql
-- Gonix Clinic OS — Multi-branch foundation
--   1) Create `branches` table (tenant-scoped, owned/jv/managed)
--   2) Add FKs from all existing branch_id columns
--   3) Add helpful indexes
--   4) RLS + updated_at trigger
-- Run AFTER 014_expand_inventory_fields.sql
-- ============================================================

-- ── Branch Ownership Type ──
DO $$ BEGIN
  CREATE TYPE branch_ownership AS ENUM ('owned','jv','managed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 1. branches table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  branch_code       text NOT NULL,                      -- เช่น 'BKK01','CNX02'
  branch_name       text NOT NULL,
  branch_name_en    text,

  ownership_type    branch_ownership NOT NULL DEFAULT 'owned',

  -- JV-specific (ใช้เมื่อ ownership_type = 'jv')
  jv_partner_name   text,
  jv_share_pct      numeric(5,2),                       -- % แบ่งกำไรให้ partner

  -- Location / contact
  address           text,
  subdistrict_code  text,
  phone             text,
  email             text,
  google_maps_url   text,
  tax_id            text,                               -- เลขผู้เสียภาษีระดับสาขา (ถ้าต่างจาก clinic)

  -- Operational
  opening_hours     jsonb DEFAULT '{}'::jsonb,          -- {"mon":"08:00-20:00",...}
  is_active         bool DEFAULT true,
  sort_order        int DEFAULT 0,
  note              text,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  UNIQUE (clinic_id, branch_code)
);

CREATE INDEX IF NOT EXISTS idx_branches_clinic ON branches(clinic_id, is_active);

-- ────────────────────────────────────────────────────────────
-- 2. updated_at trigger
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS branches_set_updated_at ON branches;
CREATE TRIGGER branches_set_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. RLS — clinic isolation (เหมือนตารางอื่น)
-- ────────────────────────────────────────────────────────────

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches: clinic isolation" ON branches;
CREATE POLICY "branches: clinic isolation"
  ON branches
  FOR ALL
  TO authenticated
  USING (clinic_id = public.my_clinic_id())
  WITH CHECK (clinic_id = public.my_clinic_id());

-- ────────────────────────────────────────────────────────────
-- 4. Add Foreign Keys to existing branch_id columns
--    (ON DELETE SET NULL — ลบสาขาแล้ว record เก่ายังอยู่ได้)
--    (NULL ยังอนุญาต — แถวเก่าที่ branch_id เป็น null ไม่กระทบ)
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'visits','appointments','clinical_tasks','feedback_surveys',
    'inventory','stock_card','visit_supply_usage',
    'invoice_headers','slip_inbox','payment_logs','expenses',
    'queue_entries','session_logs','ip_allowlist','report_schedules'
  ];
  v_table   text;
  v_fk_name text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    v_fk_name := v_table || '_branch_id_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = v_fk_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I
           ADD CONSTRAINT %I
           FOREIGN KEY (branch_id) REFERENCES public.branches(id)
           ON DELETE SET NULL',
        v_table, v_fk_name
      );
    END IF;
  END LOOP;
END $$;

-- staff.default_branch_id FK
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_default_branch_id_fkey'
  ) THEN
    ALTER TABLE public.staff
      ADD CONSTRAINT staff_default_branch_id_fkey
      FOREIGN KEY (default_branch_id) REFERENCES public.branches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. Indexes on hot-path branch_id columns
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_visits_branch       ON visits(branch_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_appts_branch        ON appointments(branch_id, appt_date);
CREATE INDEX IF NOT EXISTS idx_inventory_branch    ON inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoice_branch_date ON invoice_headers(branch_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_queue_branch_date   ON queue_entries(branch_id, queue_date);
CREATE INDEX IF NOT EXISTS idx_expense_branch_date ON expenses(branch_id, expense_date);

-- ============================================================
-- Verification (รันเองหลัง migrate เสร็จ):
--   SELECT * FROM branches;
--   SELECT conname, conrelid::regclass
--     FROM pg_constraint
--    WHERE conname LIKE '%branch_id_fkey'
--    ORDER BY conname;
--   SELECT tablename, policyname FROM pg_policies WHERE tablename = 'branches';
-- ============================================================

-- ✅ 015 done — multi-branch foundation พร้อมแล้ว
--    Next step (016): seed Tanavej branches (owned + JV) + backfill branch_id
