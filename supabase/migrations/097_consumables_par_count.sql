-- ════════════════════════════════════════════════════════════
-- 097: Consumables — track group + อัตราแปลง + PAR ต่อห้อง + Stock Count
-- ════════════════════════════════════════════════════════════
-- inventory.track_group: 'A' (นับระดับ Pack) | 'B' (นับระดับหน่วย) | 'C' (ไม่ track)
-- inventory.units_per_pack: 1 หน่วยใหญ่ = N หน่วยย่อย (เช่น 1 กล่อง = 100 ชิ้น)
-- room_par: จำนวนที่ควรมีในห้องตรวจ (PAR Level) — ฐานให้ "เบิกเติม PAR"
-- stock_counts/lines: ตรวจนับรายเดือน + shrinkage
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS track_group     text;      -- A | B | C (null = ยังไม่จัดกลุ่ม)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS units_per_pack  numeric;   -- อัตราแปลง หน่วยใหญ่→หน่วยย่อย

-- ── PAR Level ต่อห้อง ──
CREATE TABLE IF NOT EXISTS room_par (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    room_id     uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    item_id     uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    par_qty     numeric NOT NULL DEFAULT 0,
    updated_by  uuid REFERENCES profiles(id),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, room_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_room_par_room ON room_par (clinic_id, room_id);

-- ── Stock Count (ตรวจนับ) ──
CREATE TABLE IF NOT EXISTS stock_counts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    count_date  date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date,
    status      text NOT NULL DEFAULT 'open',   -- open | done
    note        text,
    counted_by  uuid REFERENCES profiles(id),
    finalized_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_count_lines (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    count_id    uuid NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    item_id     uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    system_qty  numeric NOT NULL DEFAULT 0,      -- snapshot ตอนเปิดนับ
    counted_qty numeric,                          -- ที่นับได้จริง (null = ยังไม่นับ)
    cost_price  numeric NOT NULL DEFAULT 0,       -- snapshot ต้นทุน/หน่วย
    UNIQUE (count_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count ON stock_count_lines (count_id);

-- ── RLS ──
ALTER TABLE room_par ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_par_clinic ON room_par;
CREATE POLICY room_par_clinic ON room_par FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_counts_clinic ON stock_counts;
CREATE POLICY stock_counts_clinic ON stock_counts FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE stock_count_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_count_lines_clinic ON stock_count_lines;
CREATE POLICY stock_count_lines_clinic ON stock_count_lines FOR ALL
    USING (count_id IN (SELECT id FROM stock_counts WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())))
    WITH CHECK (count_id IN (SELECT id FROM stock_counts WHERE clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())));
