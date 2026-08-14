// หัวกระดาษคลินิกกลาง — ใช้ร่วมทั้งใบรับรองแพทย์ (med-cert) และเวชระเบียน OPD (visits)
// แก้ที่นี่ที่เดียว มีผลกับเอกสารทุกใบ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ClinicMasthead({ clinic, en, taxId }: { clinic: any; en?: boolean; taxId?: string }) {
    const nameTh = clinic?.clinic_name || "ธนเวชคลินิกเวชกรรม";
    const nameEn = clinic?.clinic_name_en || "Tanavej Clinic";
    const company = clinic?.company_name as string | undefined;
    const companyEn = clinic?.company_name_en as string | undefined;
    const companyLine = en ? (companyEn || company) : company;
    return (
        <div className="flex items-center gap-3 pb-2" style={{ borderBottom: "2.5px solid #0891b2" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/clinic-logo.png" alt="" className="shrink-0" style={{ height: "66px", width: "66px", objectFit: "contain" }} />
            <div className="min-w-0" style={{ flex: 1, lineHeight: 1.45 }}>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#0e7490", letterSpacing: "0.01em" }}>{en ? nameEn : nameTh}</div>
                {!en && <div style={{ fontSize: "12px", fontWeight: 600, color: "#0891b2", letterSpacing: "0.02em", marginTop: "3px" }}>{nameEn}</div>}
                <div style={{ fontSize: "10.5px", color: "#4b5563", marginTop: "3px" }}>{en ? "License No: " : "เลขที่ใบอนุญาต "}{clinic?.license_number || "…………"}</div>
            </div>
            <div className="text-right shrink-0" style={{ fontSize: "10px", color: "#6b7280", lineHeight: 1.5, maxWidth: "46%" }}>
                {companyLine && <div style={{ fontWeight: 500, color: "#4b5563" }}>{companyLine}</div>}
                <div style={{ marginTop: "1px" }}>{clinic?.address_detail || (en ? "Chiang Mai, Thailand" : "จ.เชียงใหม่")}</div>
                {clinic?.phone && <div>{en ? "Tel: " : "โทร. "}{clinic.phone}</div>}
                {taxId && <div>{en ? "Tax ID: " : "เลขผู้เสียภาษี "}{taxId}</div>}
            </div>
        </div>
    );
}
