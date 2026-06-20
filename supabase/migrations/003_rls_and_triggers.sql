-- ============================================================
-- 003_rls_and_triggers.sql
-- Gonix Clinic OS — RLS Policies + Triggers
-- Run AFTER 002_phase0_ddl.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Auto-create profile on signup
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, clinic_id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'clinic_id')::UUID, gen_random_uuid()),
    COALESCE((NEW.raw_user_meta_data->>'role')::staff_role, 'nurse'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 2. updated_at auto-trigger (apply to tables with updated_at)
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS tenants_set_updated_at ON tenants;
CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS patients_set_updated_at ON patients;
CREATE TRIGGER patients_set_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS inventory_set_updated_at ON inventory;
CREATE TRIGGER inventory_set_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS invoice_headers_set_updated_at ON invoice_headers;
CREATE TRIGGER invoice_headers_set_updated_at
  BEFORE UPDATE ON invoice_headers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. Audit Log trigger function
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (
      clinic_id, table_name, record_id, action,
      old_data, new_data, performed_by, performed_at
    ) VALUES (
      OLD.clinic_id,
      TG_TABLE_NAME,
      OLD.id::text,
      TG_OP,
      to_jsonb(OLD),
      NULL,
      auth.uid(),
      now()
    );
    RETURN OLD;
  ELSE
    INSERT INTO audit_logs (
      clinic_id, table_name, record_id, action,
      old_data, new_data, performed_by, performed_at
    ) VALUES (
      NEW.clinic_id,
      TG_TABLE_NAME,
      NEW.id::text,
      TG_OP,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      to_jsonb(NEW),
      auth.uid(),
      now()
    );
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 4. Enable RLS + clinic_isolation policy on ALL Phase 0 tables
-- ────────────────────────────────────────────────────────────

-- Tables WITH clinic_id (bulk enable)
DO $$
DECLARE
  t text;
  tables_with_clinic_id text[] := ARRAY[
    'profiles','staff','config_system','rooms',
    'patients','visits','appointments',
    'clinical_tasks','refer_logs','referral_network','feedback_surveys',
    'inventory','stock_card','drug_orders','eprescription_logs',
    'lab_orders','supply_presets','visit_supply_usage',
    'invoice_headers','invoice_items','payment_logs','slip_inbox','expenses','expense_inbox',
    'staff_fee_rules','staff_fee_transactions','staff_fee_payouts',
    'service_categories','service_catalog',
    'overhead_config','tax_provisions','price_history',
    'promotions','package_templates','patient_packages','package_redemptions',
    'member_tiers','point_transactions',
    'queue_entries','booking_rules','noshow_policies',
    'consent_templates','document_templates','generated_documents','print_jobs',
    'notification_templates','notification_queue','line_messages',
    'audit_logs','consent_logs','session_logs','ip_allowlist',
    'running_numbers','export_jobs','report_schedules','accounting_recipients'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_clinic_id LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Drop if exists to make idempotent
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_clinic_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (
        clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
       )',
      t || '_clinic_isolation', t
    );
  END LOOP;
END;
$$;

-- Tables WITHOUT clinic_id (global reference — public read)
ALTER TABLE icd10 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "icd10_public_read" ON icd10;
CREATE POLICY "icd10_public_read" ON icd10 FOR SELECT USING (true);

ALTER TABLE address_ref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "address_ref_public_read" ON address_ref;
CREATE POLICY "address_ref_public_read" ON address_ref FOR SELECT USING (true);

ALTER TABLE data_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_lists_read" ON data_lists;
CREATE POLICY "data_lists_read" ON data_lists FOR SELECT USING (
  clinic_id IS NULL
  OR clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
);

ALTER TABLE drug_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drug_interactions_public_read" ON drug_interactions;
CREATE POLICY "drug_interactions_public_read" ON drug_interactions FOR SELECT USING (true);

-- promotion_items: no clinic_id, check via parent promotions table
ALTER TABLE promotion_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promotion_items_via_promo" ON promotion_items;
CREATE POLICY "promotion_items_via_promo" ON promotion_items FOR ALL USING (
  promo_id IN (SELECT id FROM promotions WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

-- Tables with hn PK (no clinic_id column directly, but has FK)
ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vital_signs_via_patient" ON vital_signs;
CREATE POLICY "vital_signs_via_patient" ON vital_signs FOR ALL USING (
  hn IN (SELECT hn FROM patients WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patient_allergies_via_patient" ON patient_allergies;
CREATE POLICY "patient_allergies_via_patient" ON patient_allergies FOR ALL USING (
  hn IN (SELECT hn FROM patients WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

ALTER TABLE patient_chronic_diseases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patient_chronic_diseases_via_patient" ON patient_chronic_diseases;
CREATE POLICY "patient_chronic_diseases_via_patient" ON patient_chronic_diseases FOR ALL USING (
  hn IN (SELECT hn FROM patients WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

ALTER TABLE wound_care_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wound_care_records_via_patient" ON wound_care_records;
CREATE POLICY "wound_care_records_via_patient" ON wound_care_records FOR ALL USING (
  hn IN (SELECT hn FROM patients WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

ALTER TABLE med_cert_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "med_cert_logs_via_patient" ON med_cert_logs;
CREATE POLICY "med_cert_logs_via_patient" ON med_cert_logs FOR ALL USING (
  hn IN (SELECT hn FROM patients WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

ALTER TABLE visit_status_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visit_status_logs_via_visit" ON visit_status_logs;
CREATE POLICY "visit_status_logs_via_visit" ON visit_status_logs FOR ALL USING (
  vn IN (SELECT vn FROM visits WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

ALTER TABLE staff_service_durations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_service_durations_via_staff" ON staff_service_durations;
CREATE POLICY "staff_service_durations_via_staff" ON staff_service_durations FOR ALL USING (
  staff_id IN (SELECT id FROM staff WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
);

-- Tenants itself: only readable by members
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenants_member_read" ON tenants;
CREATE POLICY "tenants_member_read" ON tenants FOR SELECT USING (
  id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "tenants_owner_manage" ON tenants;
CREATE POLICY "tenants_owner_manage" ON tenants FOR ALL USING (
  id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
);

-- ────────────────────────────────────────────────────────────
-- 5. Owner/Admin bypass policies (important tables)
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  important_tables text[] := ARRAY[
    'profiles','staff','patients','visits','inventory',
    'invoice_headers','staff_fee_transactions','staff_fee_payouts'
  ];
BEGIN
  FOREACH t IN ARRAY important_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner_bypass', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role IN (''owner'',''admin'')
          AND clinic_id = %I.clinic_id
        )
       )',
      t || '_owner_bypass', t, t
    );
  END LOOP;
END;
$$;

-- ============================================================
-- ✅ Phase 0 Complete!
--
-- Verification queries:
-- SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT tablename, policyname FROM pg_policies ORDER BY tablename;
-- SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';
-- ============================================================
