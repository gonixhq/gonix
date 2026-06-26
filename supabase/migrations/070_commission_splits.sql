-- ════════════════════════════════════════════════════════════
-- 070: Split Commission — แบ่ง DF/Commission ของ 1 รายการให้หลายคน
-- ════════════════════════════════════════════════════════════
-- override การ attribute ปกติ (visit role staff) สำหรับรายการที่ต้องหารค่ามือ
-- เช่น เซลล์ 2 คนปิดคอสร่วมกัน 50/50 — % รวมต่อ (item, role) ควร = 100
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS commission_splits (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inv_item_id  uuid NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
    role         text NOT NULL,                 -- role ของ DF ที่แบ่ง (doctor/nurse/assistant/sales)
    staff_id     uuid NOT NULL REFERENCES staff(id),
    percent      numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
    created_by   uuid REFERENCES profiles(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, inv_item_id, role, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_splits_item
    ON commission_splits (inv_item_id, role);
