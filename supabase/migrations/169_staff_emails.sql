-- ════════════════════════════════════════════════════════════
-- 169: อีเมลพนักงานในหน้าจัดการพนักงาน
-- ════════════════════════════════════════════════════════════
--   อีเมลอยู่ใน auth.users (ไม่อยู่ใน profiles) → ฟังก์ชัน SECURITY DEFINER คืนอีเมลของคนในคลินิกเดียวกัน
--   เรียกได้เฉพาะ owner/admin ที่อนุมัติแล้ว
CREATE OR REPLACE FUNCTION public.fn_clinic_member_emails()
RETURNS TABLE (id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_clinic uuid;
BEGIN
    SELECT p.clinic_id INTO v_clinic FROM public.profiles p
     WHERE p.id = auth.uid() AND p.role::text IN ('owner','admin') AND p.approval_status = 'approved';
    IF v_clinic IS NULL THEN RETURN; END IF;
    RETURN QUERY
        SELECT u.id, u.email::text FROM auth.users u
          JOIN public.profiles p ON p.id = u.id
         WHERE p.clinic_id = v_clinic;
END $$;
REVOKE ALL ON FUNCTION public.fn_clinic_member_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_clinic_member_emails() TO authenticated;
