-- ════════════════════════════════════════════════════════════
-- 100: ใบรับรองแพทย์ — workflow (status/approve) + วันพัก + ลายเซ็น
-- ════════════════════════════════════════════════════════════
-- ขยาย medical_certificates: draft → approved, วันพักจาก-ถึง, ผู้อนุมัติ, โหมดลายเซ็น
-- staff.signature_url: รูปลายเซ็น/ตรายางหมอ (Digital Signature) — render ลง PDF
-- ════════════════════════════════════════════════════════════

ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'draft';  -- draft | approved
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS clinic_id    uuid REFERENCES tenants(id);
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS rest_from    date;
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS rest_to      date;
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES profiles(id);
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS approved_at  timestamptz;
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS sign_mode    text DEFAULT 'manual';           -- manual (เซ็นกระดาษ) | digital
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_medcert_clinic_status ON medical_certificates (clinic_id, status);

-- ลายเซ็น/ตรายางหมอ
ALTER TABLE staff ADD COLUMN IF NOT EXISTS signature_url text;
COMMENT ON COLUMN staff.signature_url IS 'URL รูปลายเซ็น/ตรายางแพทย์ (Digital Signature บนใบรับรอง)';
