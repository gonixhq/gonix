-- ════════════════════════════════════════════════════════════
-- DEV ONLY: Reset all visits for a specific patient (for testing)
-- ════════════════════════════════════════════════════════════
-- Usage: เปลี่ยน HN ตามต้องการ แล้ว run ทั้งสคริปต์
-- ⚠️ ตรวจสอบ HN ให้ถูกต้องก่อน run — ลบแล้วเอาคืนไม่ได้

BEGIN;

-- ── Target patient ──
\set target_hn 'HN-00001'

-- ── 1. Delete visit-related data ──
DELETE FROM drug_orders
 WHERE vn IN (SELECT vn FROM visits WHERE hn = 'HN-00001');

DELETE FROM vital_signs
 WHERE vn IN (SELECT vn FROM visits WHERE hn = 'HN-00001');

DELETE FROM visit_status_logs
 WHERE vn IN (SELECT vn FROM visits WHERE hn = 'HN-00001');

DELETE FROM medical_certificates
 WHERE vn IN (SELECT vn FROM visits WHERE hn = 'HN-00001');

DELETE FROM referrals
 WHERE vn IN (SELECT vn FROM visits WHERE hn = 'HN-00001');

DELETE FROM visit_attachments
 WHERE hn = 'HN-00001';

DELETE FROM queue_entries
 WHERE hn = 'HN-00001';

-- ── 2. Delete appointments (both follow-ups from visits AND standalone) ──
DELETE FROM appointments
 WHERE hn = 'HN-00001';

-- ── 3. Finally delete visits ──
DELETE FROM visits WHERE hn = 'HN-00001';

-- ── 4. Reset patient stats ──
UPDATE patients
   SET visit_count = 0,
       no_show_count = 0,
       last_visit_date = NULL
 WHERE hn = 'HN-00001';

COMMIT;

-- ── Verify (ควรได้ 0 ทุกบรรทัด) ──
SELECT 'visits' AS tbl, COUNT(*) AS remaining FROM visits WHERE hn = 'HN-00001'
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments WHERE hn = 'HN-00001'
UNION ALL SELECT 'drug_orders', COUNT(*) FROM drug_orders WHERE vn IN (SELECT vn FROM visits WHERE hn = 'HN-00001')
UNION ALL SELECT 'vital_signs', COUNT(*) FROM vital_signs WHERE vn IN (SELECT vn FROM visits WHERE hn = 'HN-00001')
UNION ALL SELECT 'visit_attachments', COUNT(*) FROM visit_attachments WHERE hn = 'HN-00001'
UNION ALL SELECT 'queue_entries', COUNT(*) FROM queue_entries WHERE hn = 'HN-00001';
