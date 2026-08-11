-- 127_anon_lab_panels.sql
-- แพ็กเกจ lab นิรนาม (panel) — ตั้งชุดตรวจ + เทสย่อย + ราคาแพ็กเดียว
-- addAnonPanel: แตกเป็นเทสย่อย (price 0, ไว้กรอกผลแยก) + 1 บรรทัดค่าแพ็ก (price = ราคาแพ็ก)

CREATE TABLE IF NOT EXISTS anon_panels (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         text NOT NULL,               -- เช่น STI BASIC
    note         text,                         -- คำอธิบาย / รายชื่อย่อ
    price        numeric DEFAULT 0,            -- ราคาขายแพ็ก
    cost         numeric DEFAULT 0,            -- ต้นทุนรวม (ไว้ดูกำไร)
    result_days  int DEFAULT 1,               -- รอผลกี่วัน
    is_active    boolean DEFAULT true,
    sort_order   int DEFAULT 0,
    created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anon_panel_items (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    panel_id    uuid NOT NULL REFERENCES anon_panels(id) ON DELETE CASCADE,
    service_id  uuid NOT NULL REFERENCES service_catalog(id) ON DELETE CASCADE,
    created_at  timestamptz DEFAULT now(),
    UNIQUE (panel_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_anon_panels_clinic ON anon_panels (clinic_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_anon_panel_items_panel ON anon_panel_items (panel_id);

-- RLS: anon_panels แยกตาม clinic
ALTER TABLE anon_panels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_panels_clinic_isolation ON anon_panels;
CREATE POLICY anon_panels_clinic_isolation ON anon_panels FOR ALL TO public
    USING (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()))
    WITH CHECK (clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid()));

-- RLS: anon_panel_items ไม่มี clinic_id ตรงๆ — isolate ผ่าน panel แม่
ALTER TABLE anon_panel_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_panel_items_clinic_isolation ON anon_panel_items;
CREATE POLICY anon_panel_items_clinic_isolation ON anon_panel_items FOR ALL TO public
    USING (panel_id IN (SELECT id FROM anon_panels WHERE clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid())))
    WITH CHECK (panel_id IN (SELECT id FROM anon_panels WHERE clinic_id = (SELECT profiles.clinic_id FROM profiles WHERE profiles.id = auth.uid())));
