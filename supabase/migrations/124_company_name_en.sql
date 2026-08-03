-- 124_company_name_en.sql
-- เพิ่มชื่อบริษัท/นิติบุคคล (ภาษาอังกฤษ) สำหรับหัวกระดาษใบรับรองแพทย์ฉบับ EN
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_name_en text;

-- seed ค่าเริ่มต้นให้ธนเวช (เฉพาะที่ยังไม่มี)
UPDATE tenants
   SET company_name_en = 'THANAWET MEDICAL CO., LTD.'
 WHERE company_name_en IS NULL
   AND (clinic_name LIKE '%ธนเวช%' OR company_name LIKE '%ธนเวช%');
