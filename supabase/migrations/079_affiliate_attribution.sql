-- ════════════════════════════════════════════════════════════
-- 079: M14 Attribution Conflict Resolution
-- ════════════════════════════════════════════════════════════
-- (1) เซลล์คนแรก (patients.affiliate_id) ได้ recurring ตลอดอายุ attribution อยู่แล้ว
--     เพิ่ม log การโอนสิทธิ์ เมื่อ owner/ผู้จัดการเปลี่ยนตัวเซลล์ที่ดูแล (ข้อพิพาท)
-- (2) แบ่ง % ต่อบิล เมื่อมีเซลล์คนที่สองช่วยปิด — override การ attribute ปกติเฉพาะบิลนั้น
-- ════════════════════════════════════════════════════════════

-- log การโอนสิทธิ์ attribution ของผู้ป่วย
CREATE TABLE IF NOT EXISTS affiliate_attribution_log (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hn                text NOT NULL,
    old_affiliate_id  uuid REFERENCES affiliates(id),
    new_affiliate_id  uuid REFERENCES affiliates(id),
    actor_id          uuid REFERENCES profiles(id),
    reason            text,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_attr_log_hn
    ON affiliate_attribution_log (clinic_id, hn, created_at DESC);

-- แบ่งค่าคอมต่อบิล (override): ถ้าบิลใดมีแถวในตารางนี้
-- → ค่าคอมของบิลนั้นคิดจากตารางนี้แทน attribution ปกติ
--   แต่ละ affiliate ได้ sale × pct/100 (pct = % ของยอดขาย ที่ตกลงกัน)
CREATE TABLE IF NOT EXISTS affiliate_invoice_splits (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inv_id        text NOT NULL,
    affiliate_id  uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    pct           numeric(5,2) NOT NULL DEFAULT 0,    -- % ของยอดขายบิลนั้น
    note          text,
    created_by    uuid REFERENCES profiles(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (inv_id, affiliate_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_inv_splits_inv
    ON affiliate_invoice_splits (clinic_id, inv_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_inv_splits_aff
    ON affiliate_invoice_splits (affiliate_id);
