import QRCode from "qrcode";
import { gatePermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { getAnonCase } from "@/lib/actions/anonymous";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// ตั้งชื่อ tab/ไฟล์ PDF = Verify Code (เช่น 3A8RVS-สติ๊กเกอร์)
export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
    const { id } = await params;
    try {
        const supabase = await createClient();
        const { data } = await supabase.from("anon_cases").select("verify_code, case_code").eq("id", id).maybeSingle();
        const code = (data?.verify_code as string) || (data?.case_code as string);
        if (code) return { title: `${code}-สติ๊กเกอร์` };
    } catch { /* fallback */ }
    return { title: "นิรนาม-สติ๊กเกอร์" };
}

function dateThai(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

export default async function AnonStickerPage({ params }: { params: Promise<{ id: string }> }) {
    await gatePermission("anon.view");
    const { id } = await params;
    const data = await getAnonCase(id);
    if (!data) return <div className="p-10 text-center text-slate-500">ไม่พบเคสนิรนาม</div>;

    const code = data.verify_code || data.case_code || "—";

    // ชื่อคลินิก (แบบสั้น) สำหรับหัวสติ๊กเกอร์
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let clinicName = "";
    if (user) {
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (profile?.clinic_id) {
            const { data: c } = await supabase.from("tenants").select("clinic_name").eq("id", profile.clinic_id).maybeSingle();
            clinicName = (c?.clinic_name as string) || "";
        }
    }

    // QR ของ verify code (สร้างฝั่ง server)
    const qr = code !== "—" ? await QRCode.toDataURL(code, { width: 240, margin: 0 }) : "";

    // เวลาพิมพ์ = เวลาเก็บตัวอย่าง (เวลาไทย)
    const timeStr = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

    const Half = ({ divider }: { divider: boolean }) => (
        <div className="sticker" style={divider ? { borderBottom: "1px dashed #94a3b8" } : undefined}>
            <div className="flex h-full items-center gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-slate-700 truncate leading-tight">{clinicName} · ตรวจนิรนาม</div>
                    <div className="text-[40px] font-black tracking-[0.12em] leading-none my-1" style={{ fontFamily: "monospace" }}>{code}</div>
                    <div className="text-[12px] text-slate-500 leading-none">{dateThai(data.case_date)} · {timeStr} น.</div>
                </div>
                {qr && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="QR" style={{ width: "19mm", height: "19mm" }} className="shrink-0" />
                )}
            </div>
        </div>
    );

    return (
        <>
            <div className="no-print mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>

            {/* กระดาษ 8×6 ซม. แผ่นเดียว แบ่งครึ่งบน/ล่าง (2 ดวง) */}
            <div className="sheet" style={{ fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                <Half divider={true} />
                <Half divider={false} />
            </div>
            <p className="no-print text-center text-[11px] text-slate-400 mt-2">กระดาษ 8×6 ซม. · 2 ดวง (บน/ล่าง) แบ่งด้วยเส้นประ</p>

            <style>{`
                .sheet {
                    width: 80mm; height: 60mm;
                    box-sizing: border-box;
                    background: white;
                    margin: 0 auto;
                    overflow: hidden;
                }
                .sticker {
                    width: 80mm; height: 30mm;
                    box-sizing: border-box;
                    padding: 3mm 4mm;
                    overflow: hidden;
                }
                @media print {
                    .no-print { display: none !important; }
                    @page { size: 80mm 60mm; margin: 0; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .sheet { margin: 0; }
                }
                @media screen {
                    body { background: #f1f5f9; }
                    .sheet { box-shadow: 0 4px 20px rgba(0,0,0,0.12); margin: 24px auto; }
                }
            `}</style>
        </>
    );
}
