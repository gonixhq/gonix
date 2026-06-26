-- ════════════════════════════════════════════════════════════
-- 076: Price Approval (Soft Gate) — ป้องกัน self-dealing/ลดราคาเอง
-- ════════════════════════════════════════════════════════════
-- เมื่อมีส่วนลด → สร้างคำขออนุมัติ (pending) ไม่บล็อกการชำระ
-- ผู้จัดการ/owner อนุมัติย้อนหลัง · ผู้อนุมัติต้องคนละคนกับผู้ขอ
-- self-transaction (ชื่อลูกค้า=พนักงาน) → owner เท่านั้น
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS price_approvals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inv_id              text REFERENCES invoice_headers(id) ON DELETE CASCADE,
    vn                  text,
    hn                  text,
    patient_name        text,
    requested_by        uuid REFERENCES profiles(id),
    requester_name      text,
    discount_amount     numeric(12,2) NOT NULL DEFAULT 0,
    subtotal            numeric(12,2) NOT NULL DEFAULT 0,
    total               numeric(12,2) NOT NULL DEFAULT 0,
    is_self_transaction boolean NOT NULL DEFAULT false,
    status              text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    approved_by         uuid REFERENCES profiles(id),
    approved_at         timestamptz,
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_approvals_status ON price_approvals (clinic_id, status);
