-- ============================================================
-- 001_enums_and_types.sql
-- Gonix Clinic OS — ENUMs, Types & Helper Functions
-- Run FIRST before any DDL
-- ============================================================

-- ── Staff Roles ──
DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('owner','admin','doctor','nurse','pharmacist','receptionist','accountant','physio','dentist');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Visit Status ──
DO $$ BEGIN
  CREATE TYPE visit_status AS ENUM ('waiting','triaged','with_doctor','with_nurse','waiting_medicine','waiting_payment','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Invoice Status ──
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft','issued','partial','paid','voided','refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Payment Method ──
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash','transfer','credit_card','qr_promptpay','insurance','nhso','package','points','mixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Stock TX Type ──
DO $$ BEGIN
  CREATE TYPE stock_tx_type AS ENUM (
    'PO_RECEIVE','TRANSFER_IN','ADJUST_IN','RETURN_FROM_PATIENT','OPENING_STOCK',
    'PRESCRIPTION','SUPPLY_PRESET','INVOICE','INTERNAL_USE','WASTE','RECALL','TRANSFER_OUT','ADJUST_OUT','SAMPLE_GIVE',
    'LOT_CONVERT','RECOUNT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Package Type ──
DO $$ BEGIN
  CREATE TYPE package_type AS ENUM ('session','bundle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Patient Package Status ──
DO $$ BEGIN
  CREATE TYPE pkg_status AS ENUM ('active','started','completed','expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── NHSO Rights ──
DO $$ BEGIN
  CREATE TYPE nhso_rights AS ENUM ('gold','social','civil_servant','private','none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Dosage Form ──
DO $$ BEGIN
  CREATE TYPE dosage_form AS ENUM ('tablets','capsule','cream','syrup','injection','drops','inhaler','patch','suppository','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Allergen Type ──
DO $$ BEGIN
  CREATE TYPE allergen_type AS ENUM ('drug','food','environmental','latex','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Allergy Severity ──
DO $$ BEGIN
  CREATE TYPE allergy_severity AS ENUM ('mild','moderate','severe','life_threatening');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Queue Status ──
DO $$ BEGIN
  CREATE TYPE queue_status AS ENUM ('waiting','with_nurse','with_doctor','waiting_medicine','waiting_payment','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Account Type (Accounting) ──
DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('asset','liability','equity','revenue','expense');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Leave Type ──
DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM ('sick','annual','personal','maternity','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Cleanup old migration (001_profiles_rbac.sql)
-- ============================================================

-- Drop old RLS policies from previous migration
DROP POLICY IF EXISTS "profiles: self can read own" ON profiles;
DROP POLICY IF EXISTS "profiles: owner/admin can read clinic" ON profiles;
DROP POLICY IF EXISTS "profiles: self can update (no role escalation)" ON profiles;
DROP POLICY IF EXISTS "profiles: owner full control" ON profiles;

-- Drop old functions that have different return types
DROP FUNCTION IF EXISTS public.my_clinic_id() CASCADE;
DROP FUNCTION IF EXISTS public.my_role() CASCADE;

-- Drop old app_role enum if exists (replaced by staff_role)
DO $$ BEGIN
  -- Only drop if no table depends on it anymore
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    -- First remove default from profiles.role if it uses app_role
    ALTER TABLE IF EXISTS profiles ALTER COLUMN role DROP DEFAULT;
    -- Change column type if profiles exists with app_role
    ALTER TABLE IF EXISTS profiles ALTER COLUMN role TYPE staff_role USING role::text::staff_role;
    DROP TYPE IF EXISTS app_role;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'app_role cleanup skipped: %', SQLERRM;
END $$;

-- ============================================================
-- Helper Functions
-- ============================================================

-- Auto-update updated_at on any table
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Get current user's clinic_id
CREATE OR REPLACE FUNCTION public.my_clinic_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Get current user's role
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS staff_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ✅ Done — run 002_phase0_ddl.sql next
