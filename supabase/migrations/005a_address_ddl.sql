-- ────────────────────────────────────────────────────────────
-- Migration 005: Thailand Address Reference Table (address_ref)
-- Source: ThepExcel-Thailand-Tambon.csv (7,437 subdistricts)
-- Replaces the stub table from 002_phase0_ddl.sql
-- ────────────────────────────────────────────────────────────

-- Enable trigram extension for GIN index (required for ILIKE search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop old address_ref stub from 002_phase0_ddl.sql
DROP TABLE IF EXISTS address_ref CASCADE;

CREATE TABLE address_ref (
    subdistrict_code    text PRIMARY KEY,
    subdistrict_name    text NOT NULL,
    subdistrict_name_en text,
    district_name       text NOT NULL,
    district_name_en    text,
    province_name       text NOT NULL,
    province_name_en    text,
    postal_code         text NOT NULL
);

-- Index for fast ILIKE search on subdistrict name
CREATE INDEX IF NOT EXISTS idx_address_ref_subdistrict_name
    ON address_ref USING gin (subdistrict_name gin_trgm_ops);

-- Also create a btree index for exact match
CREATE INDEX IF NOT EXISTS idx_address_ref_postal_code
    ON address_ref (postal_code);

-- Enable RLS (read-only reference table)
ALTER TABLE address_ref ENABLE ROW LEVEL SECURITY;

CREATE POLICY "address_ref_select_authenticated"
    ON address_ref FOR SELECT
    TO authenticated
    USING (true);

-- Also allow anon to read (for public forms)
CREATE POLICY "address_ref_select_anon"
    ON address_ref FOR SELECT
    TO anon
    USING (true);

-- ── Seed data ──
