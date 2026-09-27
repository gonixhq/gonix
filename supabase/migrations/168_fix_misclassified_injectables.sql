-- ════════════════════════════════════════════════════════════
-- 168: แก้ยากิน/ยาเม็ดที่ถูกตั้งเป็น "เวชภัณฑ์ฉีด (ขวดแบ่งใช้)" ผิด
-- ════════════════════════════════════════════════════════════
--   สาเหตุ: ฟอร์มแก้ไขเดิมเดา deduction_type = injectable_vial จาก units_per_pack
--          → ยาเม็ด (Amoxicillin/Doxycycline/Oseltamivir ฯลฯ) กลายเป็นของฉีด แล้ว mig 158 ย้ายเป็นความงาม
--   เกณฑ์ย้ายกลับ = ยังไม่เคยรับเข้าเป็นขวด (ไม่มี inventory_vials) และดูเป็นยากิน:
--          รูปแบบยา/หน่วยเป็นเม็ด-แคปซูล-น้ำ หรือมีวิธีใช้ยา (ฉลากยา) หรือมีข้อบ่งใช้
--
--   ▶ ดูรายการก่อนรัน (ไม่บังคับ):
--   SELECT item_name, unit, dosage_form, capacity_unit_label, segment, category FROM inventory
--    WHERE deduction_type = 'injectable_vial' ORDER BY item_name;
-- ════════════════════════════════════════════════════════════
UPDATE inventory i
   SET deduction_type = 'unit_piece', category = 'drug', segment = 'medical', updated_at = now()
 WHERE i.deduction_type = 'injectable_vial'
   AND NOT EXISTS (SELECT 1 FROM inventory_vials v WHERE v.item_id = i.id)
   AND (
        COALESCE(i.dosage_form, '') ~* '(tab|cap|syr|susp|เม็ด|แคปซูล|น้ำเชื่อม|ยาน้ำ)'
     OR COALESCE(i.unit, '')        ~* '(tab|cap|เม็ด|แคปซูล)'
     OR COALESCE(i.capacity_unit_label, '') ~* '(tab|cap|เม็ด|แคปซูล)'
     OR COALESCE(trim(i.sig_text_default), '') <> ''
     OR COALESCE(trim(i.indication), '') <> ''
   );
