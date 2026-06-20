-- ════════════════════════════════════════════════════════════
-- 051: Seed รายการตรวจ Lab STD (สำหรับคลินิกนิรนาม)
-- ════════════════════════════════════════════════════════════
-- เพิ่มชุดตรวจโรคติดต่อทางเพศสัมพันธ์ลง service_catalog
--   item_type = 'lab_external' → จะมี "ช่องกรอกผล" ในหน้าเคสนิรนาม
-- รันซ้ำได้ปลอดภัย (ข้ามรายการที่มีชื่อซ้ำอยู่แล้ว)
-- ราคาเป็นตัวอย่าง — แก้ได้ที่ ตั้งค่า → รายการบริการ & ราคา
-- หมายเหตุ: insert ให้ทุกคลินิกใน tenants (ตอนนี้ใช้ tenant เดียว = ธนเวช)
-- ════════════════════════════════════════════════════════════

INSERT INTO service_catalog (clinic_id, service_code, service_name, item_type, selling_price, is_active)
SELECT t.id, x.code, x.name, 'lab_external', x.price, true
FROM tenants t
CROSS JOIN (VALUES
    ('LAB-HIV',     'ตรวจเอชไอวี (Anti-HIV)',                  300),
    ('LAB-HIVRAPID','ตรวจเอชไอวีแบบทราบผลเร็ว (HIV Rapid)',     200),
    ('LAB-VDRL',    'ตรวจซิฟิลิส (VDRL/RPR)',                  200),
    ('LAB-TPHA',    'ตรวจซิฟิลิสยืนยัน (TPHA)',                300),
    ('LAB-HBSAG',   'ไวรัสตับอักเสบ บี (HBsAg)',               200),
    ('LAB-ANTIHBS', 'ภูมิคุ้มกันตับอักเสบ บี (Anti-HBs)',      250),
    ('LAB-ANTIHCV', 'ไวรัสตับอักเสบ ซี (Anti-HCV)',            350),
    ('LAB-GC',      'หนองในแท้ (Gonorrhea)',                   400),
    ('LAB-CT',      'หนองในเทียม / คลามัยเดีย (Chlamydia)',    400),
    ('LAB-HSV',     'เริม (HSV IgG/IgM)',                      500),
    ('LAB-CBC',     'ความสมบูรณ์ของเม็ดเลือด (CBC)',          150)
) AS x(code, name, price)
WHERE NOT EXISTS (
    SELECT 1 FROM service_catalog sc
    WHERE sc.clinic_id = t.id AND sc.service_name = x.name
);

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT service_name, item_type, selling_price
--     FROM service_catalog WHERE item_type = 'lab_external' ORDER BY service_name;
-- ════════════════════════════════════════════════════════════
