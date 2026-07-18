-- ════════════════════════════════════════════════════════════
-- 🔴 RESET TEST DATA — ล้างข้อมูลทดสอบ ก่อนเปิดใช้จริง
-- ════════════════════════════════════════════════════════════
-- ⚠️⚠️ ลบถาวร กู้คืนไม่ได้ — ใช้เฉพาะตอนข้อมูลยังเป็น "ข้อมูลทดสอบ" เท่านั้น
-- ⚠️ อย่ารันถ้ามีคนไข้จริงมารักษาแล้ว (เวชระเบียนต้องเก็บ ≥ 5 ปี ตามกฎหมาย)
--
-- เก็บไว้ (ไม่ลบ): tenants(ตั้งค่าคลินิก) · profiles/staff(บัญชี) ·
--   service_catalog/service_categories(บริการ&ราคา) · package_templates(คอส) ·
--   rooms(ห้อง) · inventory(รายการคลัง — reset สต๊อก=0) · reference(icd/address_ref) ·
--   role_permissions/config/promotions/affiliates(นิยาม)
--
-- ล้าง: คนไข้ · visit · ใบเสร็จ/ชำระ · นัด · คิว · vital · ยา · ใบรับรอง ·
--   คอสที่ขาย · นิรนาม · loyalty · follow-up · commission/ค่าตอบแทน/ตอกบัตร ·
--   affiliate payout · ล็อต/การเคลื่อนไหวสต๊อก · logs
-- ════════════════════════════════════════════════════════════

-- ── ขั้นที่ 1 (แนะนำ): ดูตัวเลขก่อนลบ ว่ามีข้อมูลอะไรบ้าง ──
-- SELECT 'patients' t, count(*) n FROM patients
-- UNION ALL SELECT 'visits', count(*) FROM visits
-- UNION ALL SELECT 'invoice_headers', count(*) FROM invoice_headers
-- UNION ALL SELECT 'anon_cases', count(*) FROM anon_cases;

-- ── ขั้นที่ 2: ล้างข้อมูล (ทั้งหมดใน 1 transaction — error = rollback ไม่มีอะไรถูกลบ) ──
--   ใช้ DO block: ข้ามตารางที่ยังไม่มีในฐานข้อมูล (กัน error ตารางไม่พบ)
DO $$
DECLARE
    t text;
    tbls text[] := ARRAY[
        -- คนไข้ + visit + clinical
        'patients','visits','appointments','queue_entries','vital_signs','drug_orders',
        'visit_status_logs','visit_attachments','visit_supply_usage','wound_care_records',
        'lab_orders','medical_certificates','med_cert_logs',
        'referrals','refer_logs','patient_referrals','referral_network',
        'patient_allergies','patient_chronic_diseases','patient_audit_logs',
        'clinical_tasks','pending_registrations','deleted_hn_log','consent_logs',
        -- คอสที่ขาย
        'patient_packages','package_redemptions','package_usages',
        -- การเงิน
        'invoice_headers','invoice_items','payment_logs','price_approvals',
        'expenses','expense_inbox','slip_inbox','clinic_day_closes','clinic_opening_float',
        'export_jobs','print_jobs','generated_documents','eprescription_logs',
        -- loyalty / marketing / follow-up
        'loyalty_transactions','point_transactions','feedback_surveys','marketing_ad_spend',
        'follow_up_tasks','follow_up_task_log','notification_queue','line_messages',
        -- commission / payroll / ตอกบัตร / เวร
        'commission_approvals','commission_payouts','commission_splits','compensation_payouts',
        'staff_fee_payouts','staff_fee_transactions','staff_time_logs',
        'doctor_shifts','shift_swap_requests','schedule_periods','schedule_approval_log',
        -- affiliate (transaction — เก็บนิยาม affiliates ไว้)
        'affiliate_payouts','affiliate_attribution_log','affiliate_invoice_splits',
        'affiliate_line_notify_log','affiliate_month_locks',
        -- คลินิกนิรนาม
        'anon_cases','anon_case_tests','anon_result_rl',
        -- การเคลื่อนไหวสต๊อก (เก็บรายการ inventory ไว้)
        'inventory_lots','stock_card','stock_counts','stock_count_lines',
        -- logs
        'audit_logs','staff_activity_log','session_logs'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
        END IF;
    END LOOP;
END $$;

-- รีเซ็ตสต๊อกทุกรายการเป็น 0 + ล้างวันหมดอายุที่ sync มาจากล็อต (เก็บรายการคลังไว้)
UPDATE inventory SET stock_qty = 0, expiry_date = NULL;

-- ── (ทางเลือก) รีเซ็ตเลขรัน HN/VN/ใบเสร็จ ให้เริ่มนับใหม่ ──
--   ถ้าอยากให้เลขเริ่มใหม่จาก 1 (ไม่ต่อจากเลขทดสอบ) ให้เอา comment ออก:
-- TRUNCATE TABLE running_numbers;

-- ── ขั้นที่ 3: ตรวจว่าล้างหมด (ควรได้ 0 ทุกบรรทัด) ──
SELECT 'patients' t, count(*) n FROM patients
UNION ALL SELECT 'visits', count(*) FROM visits
UNION ALL SELECT 'invoice_headers', count(*) FROM invoice_headers
UNION ALL SELECT 'anon_cases', count(*) FROM anon_cases
UNION ALL SELECT 'inventory_lots', count(*) FROM inventory_lots
UNION ALL SELECT 'inventory(stock>0)', count(*) FROM inventory WHERE stock_qty > 0;
