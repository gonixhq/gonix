-- 137_clinic_assets_storage_policy.sql
-- Re-assert storage RLS ของ bucket clinic-assets ให้ตรงกับ 025 (แก้ policy drift จาก dashboard)
-- อนุญาต authenticated อ่าน/เขียน/ลบ ไฟล์ใต้โฟลเดอร์ clinic_id ของตัวเอง (segment แรกของ path)
-- ครอบคลุมทุก path: {clinic_id}/visits/... , {clinic_id}/lab-report/... , {clinic_id}/affiliates/... ฯลฯ

-- READ
DROP POLICY IF EXISTS "visit_attachments_storage_read" ON storage.objects;
DROP POLICY IF EXISTS "clinic_assets_read" ON storage.objects;
CREATE POLICY "clinic_assets_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- INSERT
DROP POLICY IF EXISTS "visit_attachments_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "clinic_assets_insert" ON storage.objects;
CREATE POLICY "clinic_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- UPDATE (upsert)
DROP POLICY IF EXISTS "clinic_assets_update" ON storage.objects;
CREATE POLICY "clinic_assets_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "visit_attachments_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "clinic_assets_delete" ON storage.objects;
CREATE POLICY "clinic_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clinic-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );
