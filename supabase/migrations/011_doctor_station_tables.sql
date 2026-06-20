-- ============================================================
-- 011_doctor_station_tables.sql
-- Creates medical_certificates and referrals tables to support
-- the new Doctor Station tab features.
-- ============================================================

-- Medical certificates table
CREATE TABLE IF NOT EXISTS medical_certificates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vn              text NOT NULL REFERENCES visits(vn),
    hn              text NOT NULL REFERENCES patients(hn),
    doctor_id       uuid REFERENCES staff(id),
    cert_type       text NOT NULL DEFAULT 'sick_leave',
    -- 'sick_leave','fit_for_work','fitness','driving','insurance','other'
    doctor_opinion  text,
    rest_days       int,
    issued_at       timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medcert_vn ON medical_certificates(vn);
CREATE INDEX IF NOT EXISTS idx_medcert_hn ON medical_certificates(hn);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vn                   text NOT NULL REFERENCES visits(vn),
    hn                   text NOT NULL REFERENCES patients(hn),
    doctor_id            uuid REFERENCES staff(id),
    destination_hospital text NOT NULL,
    referral_reason      text,
    include_history      bool DEFAULT false,
    created_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_vn ON referrals(vn);
CREATE INDEX IF NOT EXISTS idx_referral_hn ON referrals(hn);

-- ============================================================
-- End of 011_doctor_station_tables
-- ============================================================
