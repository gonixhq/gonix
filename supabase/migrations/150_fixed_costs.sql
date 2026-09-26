-- ════════════════════════════════════════════════════════════
-- 150: สเปกการเงิน เฟส 5A — ต้นทุนคงที่
-- ════════════════════════════════════════════════════════════
--   • แต่ละรายการ: ชื่อ หมวด จำนวนเงิน รอบจ่าย (รายเดือน / รายปี → หาร 12) วันเริ่ม–สิ้นสุด
--   • สถานะ actual (จ่ายจริง) / planned (วางแผน — ยังไม่จ่าย เช่น เงินเดือนกรรมการ ค่าแขวนใบ)
--     รายงานแยกสองชุด → ดูสถานการณ์ได้โดยไม่ปนตัวเลขจริง
--   • นับเป็นคลินิกเดียว ไม่แยกฝั่ง
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fixed_costs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         text NOT NULL,
    category     text NOT NULL DEFAULT 'other'
                 CHECK (category IN ('place','staff','accounting','license','marketing','other')),
    amount       numeric(12,2) NOT NULL CHECK (amount >= 0),
    cycle        text NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly','yearly')),
    start_month  date NOT NULL,          -- YYYY-MM-01
    end_month    date,                   -- YYYY-MM-01 (รวมเดือนนี้) · null = ไม่มีกำหนด
    status       text NOT NULL DEFAULT 'actual' CHECK (status IN ('actual','planned')),
    note         text,
    created_by   uuid REFERENCES profiles(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fixed_costs_month_chk CHECK (end_month IS NULL OR end_month >= start_month)
);
CREATE INDEX IF NOT EXISTS idx_fixed_costs_clinic ON fixed_costs (clinic_id, start_month);
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fixed_costs_select ON fixed_costs;
CREATE POLICY fixed_costs_select ON fixed_costs FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS fixed_costs_write ON fixed_costs;
CREATE POLICY fixed_costs_write ON fixed_costs FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));

-- ยอดต่อเดือนของรายการที่มีผลในเดือนนั้น (รายปี ÷ 12)
CREATE OR REPLACE FUNCTION public.fn_fixed_cost_month(p_clinic uuid, p_month date)
RETURNS TABLE (status text, category text, monthly numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT fc.status, fc.category,
           SUM(ROUND(CASE WHEN fc.cycle = 'yearly' THEN fc.amount / 12 ELSE fc.amount END, 2))
      FROM fixed_costs fc
     WHERE fc.clinic_id = p_clinic
       AND fc.start_month <= date_trunc('month', p_month)::date
       AND (fc.end_month IS NULL OR fc.end_month >= date_trunc('month', p_month)::date)
     GROUP BY fc.status, fc.category
$$;
GRANT EXECUTE ON FUNCTION public.fn_fixed_cost_month(uuid, date) TO authenticated;
