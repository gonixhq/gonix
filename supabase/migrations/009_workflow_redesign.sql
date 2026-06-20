-- ============================================================
-- 009_workflow_redesign.sql
-- Description: Adds necessary columns to `visits` table to
-- support the new 4-step clinic workflow (Registration, 
-- Screening, Examination, Payment/Pharmacy), including standard
-- OPD and Aesthetic cases.
-- ============================================================

-- 1. Add new columns to the `visits` table
ALTER TABLE visits
ADD COLUMN IF NOT EXISTS visit_type text DEFAULT 'opd', -- 'opd', 'aesthetic', 'wound_care', 'health_check', 'med_cert', 'follow_up'
ADD COLUMN IF NOT EXISTS present_illness text, -- PI (Present Illness)
ADD COLUMN IF NOT EXISTS pain_score int CHECK (pain_score BETWEEN 0 AND 10), -- Pain Score 0-10
ADD COLUMN IF NOT EXISTS o2_saturation numeric(4,1), -- O2 Saturation (%) from Screening
ADD COLUMN IF NOT EXISTS assigned_room_id uuid REFERENCES rooms(id), -- Sent to Room
ADD COLUMN IF NOT EXISTS assigned_doctor_id uuid REFERENCES staff(id), -- Sent to specific Doctor
ADD COLUMN IF NOT EXISTS aesthetic_records jsonb DEFAULT '{}'::jsonb; -- JSON structure for face mapping, lot numbers, etc.

-- 2. Modify existing 'visits' columns (if needed, just to be safe they can hold bigger texts)
-- (No specific alters needed as 'text' is open-ended)

-- 3. Prepare `supply_presets` for Drug Formulas / Procedures
-- `supply_presets` already holds `items` (jsonb). We can add a type to differentiate them
ALTER TABLE supply_presets
ADD COLUMN IF NOT EXISTS preset_type text DEFAULT 'drug_formula'; -- 'drug_formula', 'procedure_kit', 'iv_drip'

-- 4. Seed basic ICD-10 codes for testing
INSERT INTO icd10 (code, description_en, description_th, category) VALUES
('J00', 'Acute nasopharyngitis [common cold]', 'ไข้หวัดทั่วไป', 'Respiratory'),
('J02', 'Acute pharyngitis', 'คออักเสบเฉียบพลัน', 'Respiratory'),
('J03', 'Acute tonsillitis', 'ทอนซิลอักเสบ', 'Respiratory'),
('K21', 'Gastro-esophageal reflux disease', 'กรดไหลย้อน', 'Digestive'),
('A09', 'Infectious gastroenteritis and colitis', 'ลำไส้อักเสบติดเชื้อ/ท้องร่วง', 'Digestive'),
('I10', 'Essential (primary) hypertension', 'ความดันโลหิตสูง', 'Circulatory'),
('E11', 'Type 2 diabetes mellitus', 'เบาหวานชนิดที่ 2', 'Endocrine'),
('M54', 'Dorsalgia', 'ปวดหลัง', 'Musculoskeletal'),
('L50', 'Urticaria', 'ลมพิษ', 'Skin'),
('R50', 'Fever of other and unknown origin', 'ไข้ไม่ทราบสาเหตุ', 'Symptoms')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- End of 009_workflow_redesign
-- ============================================================
