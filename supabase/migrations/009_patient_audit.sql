-- Migration: Add patient audit log table and updated_by/updated_at columns to patients

-- 1. Add updated_at and updated_by to patients table
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES profiles(id);

-- 2. Create patient_audit_logs table
CREATE TABLE IF NOT EXISTS patient_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES tenants(id),
  hn          text NOT NULL REFERENCES patients(hn),
  changed_by  uuid NOT NULL REFERENCES profiles(id),
  changed_at  timestamptz DEFAULT now(),
  field_name  text NOT NULL,
  old_value   text,
  new_value   text
);

CREATE INDEX IF NOT EXISTS idx_patient_audit_hn ON patient_audit_logs(hn, changed_at DESC);

-- 3. Enable RLS
ALTER TABLE patient_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_audit_same_clinic" ON patient_audit_logs
  FOR ALL
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );
