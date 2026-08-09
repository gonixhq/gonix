"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";

export default function LinePosterPage() {
    const [qr, setQr] = useState("");
    const [url, setUrl] = useState("");
    const [clinicName, setClinicName] = useState("");
    const [logo, setLogo] = useState("/clinic-logo.png");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const oa = (typeof window !== "undefined" && localStorage.getItem("gonix_oa_url")) || "";
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID_LINK || "";
        const u = oa || (liffId ? `https://liff.line.me/${liffId}` : "");
        setUrl(u);
        if (u) QRCode.toDataURL(u, { width: 900, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));

        (async () => {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: prof } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
                    if (prof?.clinic_id) {
                        const { data: t } = await supabase.from("tenants").select("clinic_name, logo_url, phone").eq("id", prof.clinic_id).maybeSingle();
                        if (t) {
                            setClinicName((t.clinic_name as string) || "");
                            if (t.logo_url) setLogo(t.logo_url as string);
                            setPhone((t.phone as string) || "");
                        }
                    }
                }
            } catch { /* ignore */ }
            setLoading(false);
        })();
    }, []);

    // auto-print เมื่อ QR พร้อม
    useEffect(() => {
        if (!qr || loading) return;
        const timer = setTimeout(() => window.print(), 700);
        return () => clearTimeout(timer);
    }, [qr, loading]);

    const step = (n: string, text: string) => (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <div style={{ flexShrink: 0, width: "26px", height: "26px", borderRadius: "50%", background: "#06C755", color: "#fff", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>{n}</div>
            <div style={{ fontSize: "17px", lineHeight: 1.35, paddingTop: "1px" }}>{text}</div>
        </div>
    );

    return (
        <>
            <div className="no-print" style={{ textAlign: "center", padding: "12px", background: "#f1f5f9" }}>
                <button onClick={() => window.print()} style={{ background: "#0891b2", color: "#fff", border: 0, borderRadius: "8px", padding: "8px 20px", fontWeight: 700, cursor: "pointer" }}>พิมพ์โปสเตอร์</button>
                {!url && <p style={{ color: "#e11d48", marginTop: "8px", fontSize: "13px" }}>ยังไม่มีลิงก์ — ไปตั้งค่า &gt; การ์ด &quot;QR ผูก LINE คนไข้&quot; วางลิงก์ OA ก่อน</p>}
            </div>

            <div className="poster" style={{ fontFamily: "'Noto Sans Thai', sans-serif", color: "#0f172a" }}>
                {/* หัว: โลโก้ + ชื่อคลินิก */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo} alt="" style={{ height: "66px", width: "66px", objectFit: "contain" }} />
                    <div style={{ fontSize: "26px", fontWeight: 800, color: "#0e7490" }}>{clinicName || " "}</div>
                </div>

                <div style={{ height: "3px", background: "#06C755", borderRadius: "2px", margin: "18px 0" }} />

                {/* หัวข้อ */}
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "34px", fontWeight: 900, color: "#06C755", letterSpacing: "0.01em" }}>เพิ่มเพื่อน LINE</div>
                    <div style={{ fontSize: "19px", color: "#475569", marginTop: "4px" }}>รับแจ้งเตือน นัดหมาย · ผลตรวจ · ข้อมูลของคุณ</div>
                </div>

                {/* QR */}
                <div style={{ display: "flex", justifyContent: "center", margin: "26px 0 14px" }}>
                    <div style={{ border: "3px solid #06C755", borderRadius: "20px", padding: "16px", background: "#fff" }}>
                        {qr
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={qr} alt="LINE QR" style={{ width: "260px", height: "260px", display: "block" }} />
                            : <div style={{ width: "260px", height: "260px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>—</div>}
                    </div>
                </div>
                <div style={{ textAlign: "center", fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>สแกน QR นี้เพื่อเพิ่มเพื่อน</div>

                {/* ขั้นตอน */}
                <div style={{ maxWidth: "440px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "13px" }}>
                    {step("1", "สแกน QR / เพิ่มเพื่อน LINE ของคลินิก")}
                    {step("2", "กดลิงก์ “ผูกบัญชี” ที่ระบบส่งให้ในแชท")}
                    {step("3", "กรอก HN + เบอร์มือถือ 4 ตัวท้าย → เสร็จ")}
                </div>

                {/* ท้าย */}
                <div style={{ textAlign: "center", marginTop: "28px", fontSize: "14px", color: "#64748b" }}>
                    {phone && <>สอบถาม โทร {phone} · </>}ข้อมูลของคุณถูกเก็บเป็นความลับ · Powered by Gonix
                </div>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4 portrait; margin: 14mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .poster { margin: 0 !important; box-shadow: none !important; }
                }
                @media screen {
                    body { background: #f1f5f9; }
                    .poster { background: white; max-width: 210mm; margin: 16px auto; padding: 22mm; box-shadow: 0 4px 24px rgba(0,0,0,0.12); border-radius: 8px; }
                }
                .poster { padding: 10mm; }
            `}</style>
        </>
    );
}
