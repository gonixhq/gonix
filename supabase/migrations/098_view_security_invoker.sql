-- ════════════════════════════════════════════════════════════
-- 098: แก้ Security Definer View — บังคับ RLS ตามผู้ query (PG15+)
-- ════════════════════════════════════════════════════════════
-- v_room_current_status เดิมเป็น SECURITY DEFINER → RLS ตารางต้นทาง
-- (rooms/room_doctor_sessions/staff/profiles/visits) ถูกข้าม เสี่ยงเห็นข้ามคลินิก
-- security_invoker = on → view รันด้วยสิทธิ์+RLS ของผู้ query (authenticated)
-- ════════════════════════════════════════════════════════════

ALTER VIEW public.v_room_current_status SET (security_invoker = on);
