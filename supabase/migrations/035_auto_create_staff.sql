-- ════════════════════════════════════════════════════════════
-- 035: Auto-create staff record for profiles
-- ════════════════════════════════════════════════════════════
-- ปัญหา: handle_new_user trigger สร้างแค่ profiles → staff table ว่าง
--        ทำให้ feature ที่ query staff (assigned doctors, room check-in)
--        ไม่เห็นใครเลย
--
-- แก้:
--   1. Backfill staff สำหรับ approved profiles ทุกตัวที่ยังไม่มี
--   2. แก้ handle_new_user_approval trigger / function ให้ auto-create staff
-- ════════════════════════════════════════════════════════════

-- ── 1. Backfill ──
INSERT INTO staff (profile_id, clinic_id, is_active, created_at)
SELECT p.id, p.clinic_id, COALESCE(p.is_active, true), now()
  FROM profiles p
  LEFT JOIN staff s ON s.profile_id = p.id
 WHERE s.id IS NULL
   AND p.clinic_id IS NOT NULL
   AND p.approval_status = 'approved';

-- ── 2. Function: auto-ensure staff record ──
CREATE OR REPLACE FUNCTION fn_ensure_staff_for_profile(p_profile_id uuid)
RETURNS uuid AS $$
DECLARE
    v_staff_id uuid;
    v_clinic_id uuid;
    v_is_active bool;
BEGIN
    SELECT id INTO v_staff_id FROM staff WHERE profile_id = p_profile_id;
    IF v_staff_id IS NOT NULL THEN
        RETURN v_staff_id;
    END IF;

    SELECT clinic_id, COALESCE(is_active, true)
      INTO v_clinic_id, v_is_active
      FROM profiles WHERE id = p_profile_id;

    IF v_clinic_id IS NULL THEN
        RETURN NULL;
    END IF;

    INSERT INTO staff (profile_id, clinic_id, is_active)
    VALUES (p_profile_id, v_clinic_id, v_is_active)
    RETURNING id INTO v_staff_id;

    RETURN v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_ensure_staff_for_profile IS 'รับ profile_id → คืน staff_id (สร้างใหม่ถ้ายังไม่มี)';

-- ── 3. Trigger: auto-create staff เมื่อ profile ถูก approve ──
CREATE OR REPLACE FUNCTION trg_profile_approved_create_staff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.approval_status = 'approved'
       AND (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
       AND NEW.clinic_id IS NOT NULL THEN
        PERFORM fn_ensure_staff_for_profile(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_approved ON profiles;
CREATE TRIGGER on_profile_approved
    AFTER UPDATE OF approval_status ON profiles
    FOR EACH ROW EXECUTE FUNCTION trg_profile_approved_create_staff();

-- ── 4. Sync staff.is_active กับ profile.is_active ──
CREATE OR REPLACE FUNCTION trg_profile_active_sync_staff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
        UPDATE staff
           SET is_active = COALESCE(NEW.is_active, true)
         WHERE profile_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_active_sync ON profiles;
CREATE TRIGGER on_profile_active_sync
    AFTER UPDATE OF is_active ON profiles
    FOR EACH ROW EXECUTE FUNCTION trg_profile_active_sync_staff();

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT count(*) FROM profiles WHERE approval_status='approved';
--   SELECT count(*) FROM staff;
--   -- ทั้งสองควรเท่ากัน
-- ════════════════════════════════════════════════════════════
