-- ============================================================
-- 014_expand_inventory_fields.sql
-- Gonix Clinic OS — Add detailed inventory fields for drug labels
-- ============================================================

-- Add new columns to the `inventory` table
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS trade_name text,
ADD COLUMN IF NOT EXISTS item_name_th text,
ADD COLUMN IF NOT EXISTS storage_info text,
ADD COLUMN IF NOT EXISTS dose_qty text,
ADD COLUMN IF NOT EXISTS frequency text,
ADD COLUMN IF NOT EXISTS use_type text,
ADD COLUMN IF NOT EXISTS label_type text,
ADD COLUMN IF NOT EXISTS sig_text_default text,
ADD COLUMN IF NOT EXISTS auto_cut_stock boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS expiry_date date,
ADD COLUMN IF NOT EXISTS df_doctor numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS df_nurse numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS df_assistant numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS supplier text,
ADD COLUMN IF NOT EXISTS note text;

-- ============================================================
-- Verification query:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory';
-- ============================================================
