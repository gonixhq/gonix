-- ════════════════════════════════════════════════════════════════════
-- 025: Visit Attachments (PDF/Image attachments per visit)
-- ════════════════════════════════════════════════════════════════════
-- Stores metadata for files uploaded to Supabase Storage.
-- Actual files live in bucket `clinic-assets` under path:
--   {clinic_id}/visits/{vn}/{uuid}.{ext}

-- ── Enum for attachment category ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attachment_category') THEN
    CREATE TYPE attachment_category AS ENUM (
      'opd_record',     -- เวชระเบียน OPD
      'lab_external',   -- ผลแลบจากแลบนอก
      'lab_internal',   -- ผลแลบในคลินิก
      'imaging',        -- X-ray, ultrasound, etc.
      'consent',        -- ใบยินยอม
      'referral_doc',   -- เอกสารส่งต่อ
      'prescription',   -- ใบสั่งยา
      'med_cert',       -- ใบรับรองแพทย์
      'other'           -- อื่นๆ
    );
  END IF;
END $$;

-- ── Main table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visit_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vn            text NOT NULL REFERENCES visits(vn) ON DELETE CASCADE,
  hn            text NOT NULL REFERENCES patients(hn) ON DELETE CASCADE,

  category      attachment_category NOT NULL DEFAULT 'other',
  file_name     text NOT NULL,           -- original filename (for display)
  file_path     text NOT NULL,           -- storage path inside bucket
  file_size     bigint,                  -- bytes
  mime_type     text,                    -- e.g. application/pdf

  note          text,                    -- optional description
  uploaded_by   uuid REFERENCES profiles(id),
  uploaded_at   timestamptz DEFAULT (now() AT TIME ZONE 'Asia/Bangkok'),

  is_deleted    boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_visit_attachments_vn ON visit_attachments(vn);
CREATE INDEX IF NOT EXISTS idx_visit_attachments_hn ON visit_attachments(hn);
CREATE INDEX IF NOT EXISTS idx_visit_attachments_clinic ON visit_attachments(clinic_id);

-- ── RLS: Clinic Isolation ─────────────────────────────────────────
ALTER TABLE visit_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visit_attachments_clinic_isolation ON visit_attachments;
CREATE POLICY visit_attachments_clinic_isolation ON visit_attachments
  FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ── Storage bucket policy (ensure bucket exists; idempotent) ──────
-- Bucket `clinic-assets` should already exist from earlier setup.
-- If not, run this in Storage UI or via:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('clinic-assets', 'clinic-assets', false);

-- Storage RLS: users can read/write objects under their own clinic_id folder
DROP POLICY IF EXISTS "visit_attachments_storage_read" ON storage.objects;
CREATE POLICY "visit_attachments_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "visit_attachments_storage_insert" ON storage.objects;
CREATE POLICY "visit_attachments_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "visit_attachments_storage_delete" ON storage.objects;
CREATE POLICY "visit_attachments_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE visit_attachments IS 'Files (PDF/images) attached to visits — OPD records, lab results, imaging, etc.';
