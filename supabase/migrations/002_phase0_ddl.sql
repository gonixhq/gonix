-- ============================================================
-- 002_phase0_ddl.sql
-- Gonix Clinic OS — Phase 0 DDL (~60 tables)
-- Run AFTER 001_enums_and_types.sql
-- ============================================================

-- ── Cleanup old tables from previous migration ──
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ────────────────────────────────────────────────────────────
-- SECTION 1: AUTH & TENANT
-- ────────────────────────────────────────────────────────────

CREATE TABLE tenants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name       text NOT NULL,
  clinic_name_en    text,
  tax_id            text,
  logo_url          text,
  primary_color     text DEFAULT '#2563EB',
  plan_id           uuid,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  full_name         text NOT NULL,
  full_name_en      text,
  role              staff_role NOT NULL DEFAULT 'nurse',
  phone             text,
  avatar_url        text,
  line_user_id      text,
  is_active         bool DEFAULT true,
  last_seen_at      timestamptz,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_profiles_clinic ON profiles(clinic_id);
CREATE INDEX idx_profiles_line ON profiles(line_user_id);

CREATE TABLE staff (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES profiles(id),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  employee_code     text,
  license_number    text,
  specialties       text[],
  default_branch_id uuid,
  df_rate_pct       numeric(5,2),
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_staff_clinic ON staff(clinic_id);
CREATE INDEX idx_staff_profile ON staff(profile_id);

CREATE TABLE config_system (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  config_key        text NOT NULL,
  config_value      jsonb NOT NULL,
  updated_by        uuid REFERENCES profiles(id),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE(clinic_id, config_key)
);

CREATE TABLE rooms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  room_name         text NOT NULL,
  room_type         text NOT NULL,
  capacity          int DEFAULT 1,
  is_active         bool DEFAULT true
);

-- ────────────────────────────────────────────────────────────
-- SECTION 2: REFERENCE DATA
-- ────────────────────────────────────────────────────────────

CREATE TABLE icd10 (
  code              text PRIMARY KEY,
  description_th    text NOT NULL,
  description_en    text,
  category          text
);

CREATE TABLE address_ref (
  id                serial PRIMARY KEY,
  province_code     text NOT NULL,
  province_name     text NOT NULL,
  district_code     text NOT NULL,
  district_name     text NOT NULL,
  subdistrict_code  text NOT NULL,
  subdistrict_name  text NOT NULL,
  postal_code       text NOT NULL
);
CREATE INDEX idx_address_postal ON address_ref(postal_code);

CREATE TABLE data_lists (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid REFERENCES tenants(id),
  list_type         text NOT NULL,
  list_value        text NOT NULL,
  sort_order        int DEFAULT 0,
  is_active         bool DEFAULT true
);
CREATE INDEX idx_data_lists_type ON data_lists(list_type, clinic_id);

-- ────────────────────────────────────────────────────────────
-- SECTION 3: CLINICAL CORE
-- ────────────────────────────────────────────────────────────

CREATE TABLE patients (
  hn                text PRIMARY KEY,
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  prefix            text,
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  first_name_en     text,
  last_name_en      text,
  dob               date,
  gender            text CHECK (gender IN ('M','F','other')),
  blood_group       text,
  allergy_summary   text,
  thai_id_card      text,
  passport_no       text,
  phone             text,
  email             text,
  line_user_id      text,
  line_member_card_url text,
  nhso_rights       nhso_rights DEFAULT 'none',
  nhso_main_hospital text,
  insurance_id      uuid,
  address_detail    text,
  subdistrict_code  text,
  occupation        text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  member_tier_id    uuid,
  points_balance    numeric DEFAULT 0,
  total_spend       numeric DEFAULT 0,
  first_visit_date  date,
  last_visit_date   date,
  visit_count       int DEFAULT 0,
  no_show_count     int DEFAULT 0,
  is_blocked        bool DEFAULT false,
  block_reason      text,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_line ON patients(line_user_id);
CREATE INDEX idx_patients_name ON patients(first_name, last_name);

CREATE TABLE visits (
  vn                text PRIMARY KEY,
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  hn                text NOT NULL REFERENCES patients(hn),
  appt_id           uuid,
  visit_date        date NOT NULL DEFAULT CURRENT_DATE,
  visit_time        timetz NOT NULL DEFAULT CURRENT_TIME,
  visit_type        text DEFAULT 'opd',
  chief_complaint   text,
  soap_s            text,
  soap_o            text,
  soap_a            text,
  soap_p            text,
  icd10_primary     text REFERENCES icd10(code),
  icd10_secondary   text[],
  doctor_id         uuid REFERENCES staff(id),
  nurse_id          uuid REFERENCES staff(id),
  status            visit_status DEFAULT 'waiting',
  weight_kg         numeric,
  height_cm         numeric,
  bp_systolic       int,
  bp_diastolic      int,
  pulse_rate        int,
  temperature       numeric,
  nhso_rights       nhso_rights,
  meeting_url       text,
  completed_at      timestamptz,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_visits_clinic_date ON visits(clinic_id, visit_date);
CREATE INDEX idx_visits_hn ON visits(hn);
CREATE INDEX idx_visits_doctor ON visits(doctor_id);
CREATE INDEX idx_visits_status ON visits(status);

CREATE TABLE appointments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  hn                text NOT NULL REFERENCES patients(hn),
  doctor_id         uuid REFERENCES staff(id),
  service_id        uuid,
  appt_date         date NOT NULL,
  appt_start        timetz NOT NULL,
  appt_end          timetz NOT NULL,
  duration_min      int NOT NULL DEFAULT 30,
  room_id           uuid REFERENCES rooms(id),
  appt_type         text DEFAULT 'appointment',
  status            text DEFAULT 'confirmed',
  note              text,
  reminder_sent_at  timestamptz,
  booked_via        text DEFAULT 'staff',
  deposit_amount    numeric DEFAULT 0,
  deposit_paid      bool DEFAULT false,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_by        uuid REFERENCES profiles(id),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_appt_clinic_date ON appointments(clinic_id, appt_date);
CREATE INDEX idx_appt_doctor ON appointments(doctor_id, appt_date);
CREATE INDEX idx_appt_hn ON appointments(hn);

-- ────────────────────────────────────────────────────────────
-- SECTION 4: CLINICAL DEPTH
-- ────────────────────────────────────────────────────────────

CREATE TABLE vital_signs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  recorded_at       timestamptz DEFAULT now(),
  bp_systolic       int,
  bp_diastolic      int,
  pulse_rate        int,
  temperature       numeric(4,1),
  respiratory_rate  int,
  o2_saturation     numeric(4,1),
  weight_kg         numeric(5,1),
  height_cm         numeric(5,1),
  bmi               numeric(4,1) GENERATED ALWAYS AS
                    (ROUND((weight_kg / ((height_cm/100)^2))::numeric, 1)) STORED,
  recorded_by       uuid REFERENCES staff(id)
);
CREATE INDEX idx_vital_hn ON vital_signs(hn, recorded_at);

CREATE TABLE patient_allergies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hn                text NOT NULL REFERENCES patients(hn),
  allergen_type     allergen_type NOT NULL,
  allergen_name     text NOT NULL,
  reaction          text,
  severity          allergy_severity NOT NULL,
  verified_by       uuid REFERENCES staff(id),
  recorded_at       timestamptz DEFAULT now(),
  is_active         bool DEFAULT true
);
CREATE INDEX idx_allergy_hn ON patient_allergies(hn);

CREATE TABLE patient_chronic_diseases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hn                text NOT NULL REFERENCES patients(hn),
  disease_code      text REFERENCES icd10(code),
  disease_name      text NOT NULL,
  diagnosed_date    date,
  is_controlled     bool,
  current_medications text[],
  recorded_by       uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_chronic_hn ON patient_chronic_diseases(hn);

CREATE TABLE clinical_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  vn                text REFERENCES visits(vn),
  hn                text REFERENCES patients(hn),
  task_type         text NOT NULL,
  title             text NOT NULL,
  description       text,
  due_date          timestamptz,
  priority          text DEFAULT 'normal',
  status            text DEFAULT 'pending',
  assigned_to       uuid REFERENCES staff(id),
  created_by        uuid NOT NULL REFERENCES staff(id),
  completed_at      timestamptz,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_tasks_assigned ON clinical_tasks(assigned_to, status, due_date);
CREATE INDEX idx_tasks_hn ON clinical_tasks(hn);

CREATE TABLE wound_care_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  wound_location    text NOT NULL,
  wound_type        text,
  wound_size_cm     numeric,
  wound_grade       text,
  treatment_done    text,
  dressing_type     text,
  next_change_date  date,
  photo_urls        text[],
  recorded_by       uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE refer_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  refer_to_partner_id uuid,
  refer_to_text     text,
  refer_reason      text,
  refer_note        text,
  urgency           text DEFAULT 'routine',
  referred_by       uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE med_cert_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  cert_type         text NOT NULL,
  rest_days         int,
  valid_from        date,
  valid_until       date,
  issued_by         uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE referral_network (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  partner_name      text NOT NULL,
  partner_type      text NOT NULL,
  specialty         text,
  contact_name      text,
  phone             text,
  email             text,
  address           text,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE feedback_surveys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  nps_score         int CHECK (nps_score BETWEEN 0 AND 10),
  doctor_rating     int CHECK (doctor_rating BETWEEN 1 AND 5),
  service_rating    int CHECK (service_rating BETWEEN 1 AND 5),
  wait_rating       int CHECK (wait_rating BETWEEN 1 AND 5),
  comment           text,
  submitted_via     text DEFAULT 'LINE',
  submitted_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_feedback_clinic ON feedback_surveys(clinic_id, submitted_at);

-- ────────────────────────────────────────────────────────────
-- SECTION 5: DRUG & INVENTORY
-- ────────────────────────────────────────────────────────────

CREATE TABLE supply_presets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  preset_name       text NOT NULL,
  items             jsonb NOT NULL DEFAULT '[]',
  estimated_cogs    numeric DEFAULT 0,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE inventory (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  item_code         text,
  item_name         text NOT NULL,
  generic_name      text,
  category          text NOT NULL,
  dosage_form       dosage_form,
  strength          text,
  indication        text,
  warning_label     text,
  unit              text NOT NULL DEFAULT 'ชิ้น',
  purchase_unit     text,
  conversion_factor numeric DEFAULT 1,
  stock_qty         numeric DEFAULT 0,
  min_stock         numeric DEFAULT 0,
  cost_price        numeric DEFAULT 0,
  sell_price        numeric DEFAULT 0,
  supply_preset_id  uuid REFERENCES supply_presets(id),
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_inventory_clinic ON inventory(clinic_id, branch_id);
CREATE INDEX idx_inventory_category ON inventory(category);

CREATE TABLE stock_card (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           uuid NOT NULL REFERENCES inventory(id),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  lot_id            uuid,
  tx_type           stock_tx_type NOT NULL,
  qty_delta         numeric NOT NULL,
  balance_after     numeric NOT NULL,
  cost_per_unit     numeric,
  total_cost        numeric,
  ref_po_id         uuid,
  ref_transfer_id   uuid,
  ref_vn            text REFERENCES visits(vn),
  ref_inv_id        text,
  note              text,
  recorded_by       uuid REFERENCES staff(id),
  recorded_at       timestamptz DEFAULT now()
);
CREATE INDEX idx_stock_item_date ON stock_card(item_id, branch_id, recorded_at);
CREATE INDEX idx_stock_tx_type ON stock_card(tx_type);

CREATE TABLE drug_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  item_id           uuid NOT NULL REFERENCES inventory(id),
  lot_id            uuid,
  qty               numeric NOT NULL,
  unit              text NOT NULL,
  sig_qty           numeric,
  sig_unit          text,
  sig_route         text,
  sig_timing        text,
  sig_frequency     text,
  sig_days          int,
  sig_text          text,
  cost_per_unit     numeric DEFAULT 0,
  total_cost        numeric DEFAULT 0,
  allergy_checked_by uuid REFERENCES staff(id),
  interaction_override_reason text,
  prescribed_by     uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_drug_orders_vn ON drug_orders(vn);
CREATE INDEX idx_drug_orders_item ON drug_orders(item_id);

CREATE TABLE drug_interactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a_name       text NOT NULL,
  drug_b_name       text NOT NULL,
  severity          text NOT NULL,
  description       text,
  mechanism         text,
  source_ref        text,
  UNIQUE(drug_a_name, drug_b_name)
);

CREATE TABLE eprescription_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  doctor_id         uuid REFERENCES staff(id),
  prescribed_at     timestamptz DEFAULT now(),
  valid_until       timestamptz,
  delivery_method   text DEFAULT 'pickup',
  status            text DEFAULT 'draft',
  qr_code_url       text
);

CREATE TABLE lab_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  lab_name          text NOT NULL,
  lab_type          text,
  ordered_by        uuid REFERENCES staff(id),
  status            text DEFAULT 'ordered',
  result_value      text,
  result_unit       text,
  normal_range      text,
  result_flag       text,
  result_note       text,
  resulted_at       timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE visit_supply_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  preset_id         uuid REFERENCES supply_presets(id),
  preset_items_snapshot jsonb,
  override_items    jsonb DEFAULT '[]',
  final_items       jsonb NOT NULL DEFAULT '[]',
  total_cogs_material numeric DEFAULT 0,
  recorded_by       uuid REFERENCES staff(id),
  recorded_at       timestamptz DEFAULT now()
);
CREATE INDEX idx_supply_usage_vn ON visit_supply_usage(vn);

-- ────────────────────────────────────────────────────────────
-- SECTION 6: FINANCE
-- ────────────────────────────────────────────────────────────

CREATE TABLE invoice_headers (
  id                text PRIMARY KEY,
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  vn                text NOT NULL REFERENCES visits(vn),
  hn                text NOT NULL REFERENCES patients(hn),
  invoice_date      date NOT NULL DEFAULT CURRENT_DATE,
  subtotal          numeric NOT NULL DEFAULT 0,
  discount_amount   numeric DEFAULT 0,
  tax_amount        numeric DEFAULT 0,
  total_amount      numeric NOT NULL DEFAULT 0,
  paid_amount       numeric DEFAULT 0,
  balance_due       numeric GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  status            invoice_status DEFAULT 'draft',
  ins_claim_id      uuid,
  nhso_claim_id     uuid,
  issued_by         uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_invoice_clinic_date ON invoice_headers(clinic_id, invoice_date);
CREATE INDEX idx_invoice_hn ON invoice_headers(hn);
CREATE INDEX idx_invoice_status ON invoice_headers(status);

CREATE TABLE invoice_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inv_id            text NOT NULL REFERENCES invoice_headers(id),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  item_type         text NOT NULL,
  item_ref_id       text,
  item_name         text NOT NULL,
  qty               numeric NOT NULL DEFAULT 1,
  unit_price        numeric NOT NULL,
  discount_pct      numeric DEFAULT 0,
  line_total        numeric NOT NULL,
  cogs_amount       numeric DEFAULT 0,
  df_amount         numeric DEFAULT 0,
  vat_amount        numeric DEFAULT 0
);
CREATE INDEX idx_inv_items_inv ON invoice_items(inv_id);

CREATE TABLE slip_inbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  raw_image_url     text NOT NULL,
  ocr_result        jsonb,
  detected_amount   numeric,
  detected_bank     text,
  detected_ref      text,
  detected_datetime timestamptz,
  verify_status     text DEFAULT 'pending',
  fake_reason       text,
  verified_by       uuid REFERENCES staff(id),
  verified_at       timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE payment_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inv_id            text NOT NULL REFERENCES invoice_headers(id),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  payment_method    payment_method NOT NULL,
  amount            numeric NOT NULL,
  slip_ref          text,
  slip_inbox_id     uuid REFERENCES slip_inbox(id),
  bank_name         text,
  transaction_ref   text,
  deposit_type      text DEFAULT 'none',
  deposit_status    text,
  paid_at           timestamptz DEFAULT now(),
  received_by       uuid REFERENCES staff(id),
  note              text
);
CREATE INDEX idx_payment_inv ON payment_logs(inv_id);

CREATE TABLE expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  expense_date      date NOT NULL DEFAULT CURRENT_DATE,
  category          text NOT NULL,
  description       text NOT NULL,
  amount            numeric NOT NULL,
  vat_amount        numeric DEFAULT 0,
  receipt_url       text,
  vendor_name       text,
  payment_method    payment_method,
  approved_by       uuid REFERENCES staff(id),
  recorded_by       uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_expenses_clinic_date ON expenses(clinic_id, expense_date);

CREATE TABLE expense_inbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  image_url         text NOT NULL,
  ocr_result        jsonb,
  detected_amount   numeric,
  detected_vendor   text,
  detected_date     date,
  status            text DEFAULT 'pending',
  expense_id        uuid REFERENCES expenses(id),
  reviewed_by       uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- SECTION 7: DOCTOR FEE (DF)
-- ────────────────────────────────────────────────────────────

CREATE TABLE staff_fee_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  rule_name         text NOT NULL,
  staff_id          uuid REFERENCES staff(id),
  service_id        uuid,
  fee_type          text NOT NULL,
  fee_value         numeric NOT NULL,
  min_amount        numeric DEFAULT 0,
  max_amount        numeric,
  effective_from    date NOT NULL DEFAULT CURRENT_DATE,
  effective_until   date,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE staff_fee_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  vn                text NOT NULL REFERENCES visits(vn),
  inv_id            text REFERENCES invoice_headers(id),
  staff_id          uuid NOT NULL REFERENCES staff(id),
  rule_id           uuid REFERENCES staff_fee_rules(id),
  service_name      text,
  revenue_amount    numeric NOT NULL,
  fee_amount        numeric NOT NULL,
  fee_pct           numeric,
  period_month      date,
  payout_id         uuid,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_df_tx_staff ON staff_fee_transactions(staff_id, period_month);

CREATE TABLE staff_fee_payouts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  staff_id          uuid NOT NULL REFERENCES staff(id),
  period_month      date NOT NULL,
  total_df_amount   numeric NOT NULL,
  tx_count          int DEFAULT 0,
  status            text DEFAULT 'pending',
  paid_at           timestamptz,
  approved_by       uuid REFERENCES staff(id),
  note              text,
  created_at        timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- SECTION 8: PRICING & SERVICE
-- ────────────────────────────────────────────────────────────

CREATE TABLE service_categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid REFERENCES tenants(id),
  parent_id         uuid REFERENCES service_categories(id),
  name_th           text NOT NULL,
  name_en           text,
  icon_url          text,
  sort_order        int DEFAULT 0,
  is_global         bool DEFAULT false,
  is_active         bool DEFAULT true
);

CREATE TABLE service_catalog (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  category_id       uuid REFERENCES service_categories(id),
  service_code      text,
  service_name      text NOT NULL,
  selling_price     numeric NOT NULL DEFAULT 0,
  cogs_drug         numeric DEFAULT 0,
  cogs_material     numeric DEFAULT 0,
  df_estimated      numeric DEFAULT 0,
  overhead_per_unit numeric DEFAULT 0,
  gross_margin_pct  numeric GENERATED ALWAYS AS (
    CASE WHEN selling_price > 0
    THEN ROUND(((selling_price - cogs_drug - cogs_material - df_estimated - overhead_per_unit) / selling_price * 100)::numeric, 2)
    ELSE 0 END
  ) STORED,
  duration_min      int DEFAULT 30,
  required_room_type text,
  required_asset_type text,
  supply_preset_id  uuid REFERENCES supply_presets(id),
  consent_template_id uuid,
  icd10_default     text REFERENCES icd10(code),
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_service_clinic ON service_catalog(clinic_id);
CREATE INDEX idx_service_category ON service_catalog(category_id);

CREATE TABLE staff_service_durations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          uuid NOT NULL REFERENCES staff(id),
  service_id        uuid NOT NULL REFERENCES service_catalog(id),
  duration_min      int NOT NULL,
  avg_actual_min    numeric,
  note              text,
  UNIQUE(staff_id, service_id)
);

CREATE TABLE overhead_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  month             date NOT NULL,
  rent              numeric DEFAULT 0,
  utilities         numeric DEFAULT 0,
  salaries          numeric DEFAULT 0,
  marketing         numeric DEFAULT 0,
  other             numeric DEFAULT 0,
  total_overhead    numeric GENERATED ALWAYS AS (rent + utilities + salaries + marketing + other) STORED,
  expected_visits   int DEFAULT 1,
  overhead_per_visit numeric GENERATED ALWAYS AS (
    CASE WHEN expected_visits > 0
    THEN ROUND((rent + utilities + salaries + marketing + other) / expected_visits, 2)
    ELSE 0 END
  ) STORED,
  UNIQUE(clinic_id, month)
);

CREATE TABLE tax_provisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  period_month      date NOT NULL,
  gross_revenue     numeric NOT NULL,
  total_cogs        numeric DEFAULT 0,
  total_overhead    numeric DEFAULT 0,
  taxable_income    numeric GENERATED ALWAYS AS (gross_revenue - total_cogs - total_overhead) STORED,
  tax_rate_pct      numeric DEFAULT 20,
  provision_amount  numeric,
  status            text DEFAULT 'draft',
  UNIQUE(clinic_id, period_month)
);

CREATE TABLE price_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        uuid NOT NULL REFERENCES service_catalog(id),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  old_price         numeric NOT NULL,
  new_price         numeric NOT NULL,
  changed_at        timestamptz DEFAULT now(),
  changed_by        uuid REFERENCES staff(id),
  reason            text
);

-- ────────────────────────────────────────────────────────────
-- SECTION 9: PROMOTIONS & PACKAGES
-- ────────────────────────────────────────────────────────────

CREATE TABLE promotions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  promo_name        text NOT NULL,
  promo_type        text NOT NULL,
  discount_pct      numeric,
  discount_amount   numeric,
  min_purchase      numeric DEFAULT 0,
  valid_from        date NOT NULL,
  valid_until       date,
  usage_limit       int,
  used_count        int DEFAULT 0,
  promo_code        text,
  applicable_to     text DEFAULT 'all',
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE promotion_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id          uuid NOT NULL REFERENCES promotions(id),
  item_type         text NOT NULL,
  item_id           uuid NOT NULL,
  qty_required      int DEFAULT 1,
  qty_free          int DEFAULT 0
);

CREATE TABLE package_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  name              text NOT NULL,
  package_type      package_type NOT NULL,
  items             jsonb NOT NULL DEFAULT '[]',
  selling_price     numeric NOT NULL,
  total_list_price  numeric,
  discount_amount   numeric DEFAULT 0,
  cogs_total        numeric DEFAULT 0,
  gross_margin_pct  numeric,
  validity_days     int DEFAULT 365,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE patient_packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  template_id       uuid REFERENCES package_templates(id),
  package_name      text NOT NULL,
  package_type      package_type NOT NULL,
  selling_price     numeric NOT NULL,
  items_snapshot    jsonb NOT NULL DEFAULT '[]',
  total_sessions    int DEFAULT 0,
  used_sessions     int DEFAULT 0,
  remaining_sessions int GENERATED ALWAYS AS (total_sessions - used_sessions) STORED,
  purchase_date     date NOT NULL DEFAULT CURRENT_DATE,
  expire_date       date NOT NULL,
  status            pkg_status DEFAULT 'active',
  sold_by           uuid REFERENCES staff(id),
  inv_id            text REFERENCES invoice_headers(id),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_pkg_hn ON patient_packages(hn, status);

CREATE TABLE package_redemptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_pkg_id    uuid NOT NULL REFERENCES patient_packages(id),
  vn                text NOT NULL REFERENCES visits(vn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  service_id        uuid REFERENCES service_catalog(id),
  sessions_used     int NOT NULL DEFAULT 1,
  redeemed_at       timestamptz DEFAULT now(),
  redeemed_by       uuid REFERENCES staff(id)
);
CREATE INDEX idx_redemption_pkg ON package_redemptions(patient_pkg_id);

CREATE TABLE member_tiers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  tier_name         text NOT NULL,
  min_spend         numeric NOT NULL,
  discount_pct      numeric DEFAULT 0,
  point_multiplier  numeric DEFAULT 1,
  perks             jsonb DEFAULT '{}',
  color_hex         text,
  icon_url          text,
  sort_order        int DEFAULT 0,
  is_active         bool DEFAULT true
);

CREATE TABLE point_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  tx_type           text NOT NULL,
  points            numeric NOT NULL,
  balance_after     numeric NOT NULL,
  ref_inv_id        text REFERENCES invoice_headers(id),
  note              text,
  created_by        uuid REFERENCES staff(id),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_points_hn ON point_transactions(hn, created_at);

-- ────────────────────────────────────────────────────────────
-- SECTION 10: QUEUE & BOOKING
-- ────────────────────────────────────────────────────────────

CREATE TABLE queue_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  hn                text NOT NULL REFERENCES patients(hn),
  vn                text REFERENCES visits(vn),
  appt_id           uuid REFERENCES appointments(id),
  queue_number      text NOT NULL,
  queue_type        text DEFAULT 'appointment',
  status            queue_status DEFAULT 'waiting',
  called_at         timestamptz,
  started_at        timestamptz,
  done_at           timestamptz,
  wait_min          int GENERATED ALWAYS AS (
    CASE WHEN started_at IS NOT NULL AND called_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (started_at - called_at))/60
    ELSE NULL END::int
  ) STORED,
  room_id           uuid REFERENCES rooms(id),
  queue_date        date NOT NULL DEFAULT CURRENT_DATE,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_queue_clinic_date ON queue_entries(clinic_id, queue_date, status);

CREATE TABLE booking_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  doctor_id         uuid REFERENCES staff(id),
  min_lead_hours    int DEFAULT 2,
  max_advance_days  int DEFAULT 60,
  buffer_min        int DEFAULT 10,
  max_daily_appts   int DEFAULT 20,
  allow_online_booking bool DEFAULT true,
  online_booking_channels text[] DEFAULT ARRAY['LINE'],
  is_active         bool DEFAULT true,
  UNIQUE(clinic_id, doctor_id)
);

CREATE TABLE noshow_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id) UNIQUE,
  warn_after_count  int DEFAULT 2,
  block_after_count int DEFAULT 3,
  block_duration_days int DEFAULT 30,
  require_deposit_after_count int DEFAULT 1,
  deposit_amount    numeric DEFAULT 200
);

CREATE TABLE visit_status_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vn                text NOT NULL REFERENCES visits(vn),
  old_status        visit_status,
  new_status        visit_status NOT NULL,
  changed_by        uuid REFERENCES profiles(id),
  changed_at        timestamptz DEFAULT now(),
  note              text
);

-- ────────────────────────────────────────────────────────────
-- SECTION 11: DOCUMENTS & NOTIFICATIONS
-- ────────────────────────────────────────────────────────────

CREATE TABLE consent_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  title             text NOT NULL,
  consent_type      text NOT NULL,
  body_html         text NOT NULL,
  version           text DEFAULT '1.0',
  language          text DEFAULT 'th',
  requires_witness  bool DEFAULT false,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE document_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  template_name     text NOT NULL,
  template_type     text NOT NULL,
  body_html         text NOT NULL,
  variables         jsonb DEFAULT '[]',
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE generated_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  template_id       uuid REFERENCES document_templates(id),
  vn                text REFERENCES visits(vn),
  hn                text REFERENCES patients(hn),
  doc_type          text NOT NULL,
  variables_used    jsonb,
  output_url        text,
  generated_by      uuid REFERENCES staff(id),
  generated_at      timestamptz DEFAULT now()
);

CREATE TABLE print_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  doc_id            uuid REFERENCES generated_documents(id),
  printer_name      text,
  copies            int DEFAULT 1,
  status            text DEFAULT 'queued',
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE notification_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid REFERENCES tenants(id),
  template_name     text NOT NULL,
  use_case          text NOT NULL,
  channel           text NOT NULL,
  subject           text,
  body_template     text NOT NULL,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE notification_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  template_id       uuid REFERENCES notification_templates(id),
  recipient_type    text NOT NULL,
  recipient_id      text NOT NULL,
  channel           text NOT NULL,
  payload           jsonb NOT NULL,
  scheduled_at      timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz,
  status            text DEFAULT 'pending',
  error_message     text,
  retry_count       int DEFAULT 0
);
CREATE INDEX idx_notif_queue_status ON notification_queue(status, scheduled_at);

CREATE TABLE line_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  line_user_id      text NOT NULL,
  hn                text REFERENCES patients(hn),
  direction         text NOT NULL,
  message_type      text,
  content           text,
  raw_payload       jsonb,
  created_at        timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- SECTION 12: SECURITY & OPS
-- ────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  table_name        text NOT NULL,
  record_id         text NOT NULL,
  action            text NOT NULL,
  old_data          jsonb,
  new_data          jsonb,
  performed_by      uuid REFERENCES profiles(id),
  performed_at      timestamptz DEFAULT now(),
  ip_address        inet
);
CREATE INDEX idx_audit_clinic ON audit_logs(clinic_id, performed_at);
CREATE INDEX idx_audit_table ON audit_logs(table_name, record_id);

CREATE TABLE consent_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hn                text NOT NULL REFERENCES patients(hn),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  action            text NOT NULL,
  consented         bool NOT NULL,
  consent_method    text,
  ip_address        inet,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE session_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  device_type       text,
  device_fingerprint text,
  user_agent        text,
  ip_address        inet,
  login_at          timestamptz DEFAULT now(),
  logout_at         timestamptz,
  last_active_at    timestamptz DEFAULT now(),
  status            text DEFAULT 'active'
);
CREATE INDEX idx_session_user ON session_logs(user_id, status);

CREATE TABLE ip_allowlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  ip_cidr           cidr NOT NULL,
  label             text,
  is_active         bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE running_numbers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  number_type       text NOT NULL,
  prefix            text NOT NULL,
  last_number       int NOT NULL DEFAULT 0,
  reset_period      text DEFAULT 'daily',
  last_reset_date   date,
  UNIQUE(clinic_id, number_type)
);

CREATE TABLE export_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  job_type          text NOT NULL,
  status            text DEFAULT 'pending',
  params            jsonb,
  output_url        text,
  requested_by      uuid REFERENCES profiles(id),
  created_at        timestamptz DEFAULT now(),
  completed_at      timestamptz
);

CREATE TABLE report_schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  branch_id         uuid,
  report_type       text NOT NULL,
  cron_expression   text NOT NULL,
  recipients        text[] NOT NULL,
  last_run_at       timestamptz,
  next_run_at       timestamptz,
  is_active         bool DEFAULT true
);

CREATE TABLE accounting_recipients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id),
  email             text NOT NULL,
  recipient_name    text,
  report_types      text[] DEFAULT ARRAY['monthly_summary'],
  is_active         bool DEFAULT true
);

-- ────────────────────────────────────────────────────────────
-- SECTION 13: RUNNING NUMBER FUNCTION
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_next_number(
  p_clinic_id uuid,
  p_type text,
  p_prefix text DEFAULT NULL
) RETURNS text AS $$
DECLARE
  v_prefix text;
  v_next   int;
  v_date   text := to_char(CURRENT_DATE, 'YYYYMMDD');
BEGIN
  v_prefix := COALESCE(p_prefix, p_type || '-' || v_date || '-');

  UPDATE running_numbers
  SET last_number = CASE
        WHEN reset_period = 'daily' AND last_reset_date < CURRENT_DATE THEN 1
        ELSE last_number + 1
      END,
      last_reset_date = CASE
        WHEN reset_period = 'daily' AND last_reset_date < CURRENT_DATE
        THEN CURRENT_DATE ELSE last_reset_date END
  WHERE clinic_id = p_clinic_id AND number_type = p_type
  RETURNING last_number INTO v_next;

  IF NOT FOUND THEN
    INSERT INTO running_numbers(clinic_id, number_type, prefix, last_number, last_reset_date)
    VALUES (p_clinic_id, p_type, v_prefix, 1, CURRENT_DATE)
    RETURNING last_number INTO v_next;
  END IF;

  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ✅ Phase 0 DDL Done — run 003_rls_and_triggers.sql next
