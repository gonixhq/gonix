import { gatePermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { getAnonCase, type AnonCaseFull } from "@/lib/actions/anonymous";
import { isLabType } from "@/lib/anon-shared";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import { ClinicMasthead } from "@/app/print/clinic-masthead";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// ตั้งชื่อ tab/ไฟล์ PDF = Verify Code (เช่น 3A8RVS-ใบเสร็จ)
export async function generateMetadata(
    { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }
): Promise<Metadata> {
    const { id } = await params;
    const doc = (await searchParams).doc === "receipt" ? "receipt" : "result";
    const suffix = doc === "receipt" ? "ใบเสร็จ" : "ผลตรวจ";
    try {
        const supabase = await createClient();
        const { data } = await supabase.from("anon_cases").select("verify_code, case_code").eq("id", id).maybeSingle();
        const code = (data?.verify_code as string) || (data?.case_code as string);
        if (code) return { title: `${code}-${suffix}` };
    } catch { /* fallback */ }
    return { title: `นิรนาม-${suffix}` };
}

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SEX_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่นๆ" };
const RESULT_LABEL: Record<string, string> = {
    pending: "รอผล", sent_out: "ส่งตรวจยืนยัน (Lab นอก)", negative: "ลบ / ปกติ", positive: "บวก / ผิดปกติ", inconclusive: "สรุปไม่ได้",
};
const RESULT_CLS: Record<string, string> = {
    pending: "border-slate-300 bg-slate-50 text-slate-600",
    sent_out: "border-slate-300 bg-slate-50 text-slate-600",
    negative: "border-emerald-400 bg-emerald-50 text-emerald-700",
    positive: "border-rose-400 bg-rose-50 text-rose-700",
    inconclusive: "border-amber-400 bg-amber-50 text-amber-700",
};
const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: "เงินสด", transfer: "โอนเงิน / QR", qr_promptpay: "QR / พร้อมเพย์",
    credit_card: "บัตรเครดิต", debit_card: "บัตรเดบิต",
};
const ITEM_TYPE_LABEL: Record<string, string> = {
    doctor_fee: "ค่าตรวจ", drug: "ค่ายา", lab: "ค่าตรวจห้องปฏิบัติการ", procedure: "ค่าหัตถการ",
    service: "ค่าบริการ", supply: "ค่าวัสดุ", lab_external: "ค่าตรวจห้องปฏิบัติการภายนอก", other: "อื่นๆ",
};

function dateThaiLong(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}
function thaiDate(d: string): string {
    const x = new Date(d + "T00:00:00");
    const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${x.getDate()} ${m[x.getMonth()]} ${x.getFullYear() + 543}`;
}
function formatPhone(raw: string | null | undefined): string {
    if (!raw) return "";
    return raw.split(/[/,]/).map((s) => s.trim()).filter(Boolean).map((p) => {
        const d = p.replace(/\D/g, "");
        if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
        if (d.length === 9) return `${d.slice(0, 3)}-${d.slice(3)}`;
        return p;
    }).join(" / ");
}
function bahtText(n: number): string {
    const units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
    const nums = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    if (n === 0) return "ศูนย์บาทถ้วน";
    const intPart = Math.floor(n);
    const decPart = Math.round((n - intPart) * 100);
    function readInt(num: number): string {
        if (num === 0) return "";
        let result = "";
        const s = num.toString();
        const len = s.length;
        for (let i = 0; i < len; i++) {
            const digit = parseInt(s[i]);
            const pos = len - i - 1;
            if (digit === 0) continue;
            if (pos === 0 && digit === 1 && len > 1) result += "เอ็ด";
            else if (pos === 1 && digit === 1) result += "สิบ";
            else if (pos === 1 && digit === 2) result += "ยี่สิบ";
            else if (pos === 1) result += nums[digit] + "สิบ";
            else result += nums[digit] + units[pos];
        }
        return result;
    }
    let txt = readInt(intPart) + "บาท";
    txt += decPart === 0 ? "ถ้วน" : readInt(decPart) + "สตางค์";
    return txt;
}

type Clinic = { clinic_name?: string; clinic_name_en?: string; company_name?: string; company_name_en?: string; address_detail?: string; phone?: string; tax_id?: string; license_number?: string; logo_url?: string } | null;
type Branch = { branch_name?: string; address?: string; phone?: string } | null;

export default async function AnonPrintPage({
    params, searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ doc?: string }>;
}) {
    await gatePermission("anon.view");
    const { id } = await params;
    const sp = await searchParams;
    const isReceipt = sp.doc === "receipt";
    const data = await getAnonCase(id);
    if (!data) return <div className="p-10 text-center text-slate-500">ไม่พบเคสนิรนาม</div>;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let clinic: Clinic = null;
    let branch: Branch = null;
    if (user) {
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (profile?.clinic_id) {
            const { data: c } = await supabase.from("tenants")
                .select("clinic_name, clinic_name_en, company_name, company_name_en, address_detail, phone, tax_id, license_number, logo_url").eq("id", profile.clinic_id).maybeSingle();
            clinic = c;
            const { data: b } = await supabase.from("branches")
                .select("branch_name, address, phone").eq("clinic_id", profile.clinic_id).eq("is_active", true)
                .order("sort_order").limit(1).maybeSingle();
            branch = b;
        }
    }

    // ── RECEIPT (ฟอร์แมตเดียวกับใบเสร็จคนไข้ปกติ — 2 ฉบับ) ──
    if (isReceipt) {
        return (
            <>
                <div className="no-print"><PrintTrigger /></div>
                <div className="sheet">
                    <ReceiptHalf copyLabel="ต้นฉบับ" copyLabelEn="Original" isOriginal data={data} clinic={clinic} branch={branch} />
                    <ReceiptHalf copyLabel="สำเนา" copyLabelEn="Copy" isOriginal={false} data={data} clinic={clinic} branch={branch} />
                </div>
                <style>{`
                    @media print {
                        .no-print { display: none !important; }
                        @page { size: A4; margin: 0; }
                        body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                    @media screen { body { background: #f1f5f9; } .sheet { box-shadow: 0 4px 20px rgba(0,0,0,0.12); margin: 16px auto; } }
                    .sheet { width: 210mm; background: white; font-family: 'Noto Sans Thai', sans-serif; }
                    .receipt-half { height: 148.5mm; box-sizing: border-box; border-bottom: 1px dashed #94a3b8; }
                `}</style>
            </>
        );
    }

    // ── RESULT (ใบรายงานผล นิรนาม) ──
    const labTests = data.tests.filter((t) => isLabType(t.item_type));
    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                <ClinicMasthead clinic={clinic} />
                <div className="text-center mt-3" style={{ fontSize: "17px", fontWeight: 900 }}>
                    ใบรายงานผลตรวจ<span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}> · Lab Result</span>
                </div>
                <div className="text-center text-[11px] text-slate-500 mt-0.5">เอกสารไม่ระบุตัวตน (Anonymous) — อ้างอิงด้วยรหัสเคส</div>

                <div className="mt-3 grid grid-cols-4 rounded-lg border border-slate-300 divide-x divide-slate-200 text-center overflow-hidden">
                    <InfoCell label="รหัสเคส · Code" value={data.verify_code || data.case_code || "—"} mono accent />
                    <InfoCell label="เพศ · Sex" value={data.sex ? SEX_LABEL[data.sex] || data.sex : "ไม่ระบุ"} />
                    <InfoCell label="อายุ · Age" value={data.age != null ? `${data.age} ปี` : "ไม่ระบุ"} />
                    <InfoCell label="วันที่รายงาน · Date" value={thaiDate(data.case_date)} />
                </div>

                <div className="mt-4">
                    <h2 className="text-[14px] font-black tracking-wider mb-2">ผลการตรวจ</h2>
                    <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid #0891b2", background: "#ecfeff" }} className="text-left">
                                <th className="py-2 px-2 font-black">รายการตรวจ <span className="text-[10px] font-semibold text-slate-500">Test</span></th>
                                <th className="py-2 px-2 font-black">ผล <span className="text-[10px] font-semibold text-slate-500">Result</span></th>
                                <th className="py-2 px-2 font-black">การแปลผล <span className="text-[10px] font-semibold text-slate-500">Interpretation</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {labTests.map((t, i) => (
                                <tr key={t.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 ? "#f8fafc" : "#fff" }}>
                                    <td className="py-2 px-2 font-semibold align-top">{t.test_name}</td>
                                    <td className="py-2 px-2 tabular-nums align-top">{t.result_value || "—"}</td>
                                    <td className="py-2 px-2 align-top">
                                        <span className={`inline-block text-[11.5px] font-bold px-2 py-0.5 rounded-full border ${RESULT_CLS[t.result_status] || RESULT_CLS.pending}`}>{RESULT_LABEL[t.result_status] || "รอผล"}</span>
                                        {t.result_note ? <div className="text-slate-500 text-[10.5px] mt-0.5">{t.result_note}</div> : null}
                                    </td>
                                </tr>
                            ))}
                            {labTests.length === 0 && <tr><td colSpan={3} className="py-3 px-2 text-slate-400 italic">ยังไม่มีรายการตรวจ Lab</td></tr>}
                        </tbody>
                    </table>
                    {data.result_appt_date && <p className="mt-3 text-[12px]">นัดฟังผล/ติดตาม: <b>{dateThaiLong(data.result_appt_date)}</b></p>}
                    <p className="mt-4 text-[11px] text-slate-500 italic leading-relaxed">
                        * เอกสารนี้ออกแบบไม่ระบุตัวตน — กรุณาเก็บรหัสเคสไว้เพื่อใช้ติดตามผลและรับคำปรึกษา ผลตรวจควรได้รับการแปลผลและคำปรึกษาจากบุคลากรทางการแพทย์
                    </p>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-16 text-[12px]">
                    <div className="text-center"><div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" /><div className="text-[10px] italic text-slate-600">ผู้รายงานผล / เจ้าหน้าที่</div></div>
                    <div className="text-center"><div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" /><div className="text-[10px] italic text-slate-600">ผู้ตรวจสอบ / แพทย์</div></div>
                </div>
                <div className="mt-4 text-[10px] text-slate-500 text-center italic">
                    ออกจากระบบ Gonix — พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </div>
            </div>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4; margin: 14mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-page { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
                }
                @media screen { .print-page { background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.1); margin: 20px auto; padding: 14mm; } body { background: #f1f5f9; } }
            `}</style>
        </>
    );
}

// ── ใบเสร็จ 1 ฉบับ (โครงเดียวกับใบเสร็จคนไข้ปกติ) ──
function ReceiptHalf({ copyLabel, copyLabelEn, isOriginal, data, clinic, branch }: {
    copyLabel: string; copyLabelEn: string; isOriginal: boolean;
    data: AnonCaseFull; clinic: Clinic; branch: Branch;
}) {
    const total = data.total_amount;
    const code = data.verify_code || data.case_code || "—";
    return (
        <div className="receipt-half relative px-6 py-4 text-[10.5px] leading-snug text-slate-900 flex flex-col gap-2">
            {/* Header */}
            <ClinicMasthead clinic={clinic} />
            <div className="flex items-end justify-between mt-1.5 px-1">
                <div>
                    <span className="text-[13px] font-black">ใบเสร็จรับเงิน · Receipt</span>
                    <span className="text-[10px] text-slate-600 ml-2">เลขผู้เสียภาษี <span className="font-mono">{clinic?.tax_id || "0505569001439"}</span></span>
                </div>
                <div className={`text-[10px] font-bold px-2.5 py-0.5 rounded border-2 ${isOriginal ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-amber-50 border-amber-500 text-amber-700"}`}>
                    {copyLabel} · {copyLabelEn}
                </div>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-1">
                <div className="space-y-1">
                    <div className="flex gap-2"><span className="text-slate-500 w-16 shrink-0">เลขที่:</span><span className="font-mono font-bold">{data.receipt_no || code}</span></div>
                    <div className="flex gap-2"><span className="text-slate-500 w-16 shrink-0">วันที่:</span><span>{thaiDate(data.case_date)}</span></div>
                    <div className="flex gap-2"><span className="text-slate-500 w-16 shrink-0">รหัสเคส:</span><span className="font-mono font-bold">{code}</span></div>
                </div>
                <div className="space-y-1">
                    <div className="flex gap-2"><span className="text-slate-500 w-16 shrink-0">ผู้รับบริการ:</span><span className="font-semibold">นิรนาม (Anonymous)</span></div>
                    <div className="flex gap-2"><span className="text-slate-500 w-16 shrink-0">บริการ:</span><span>ตรวจเลือดแบบไม่ระบุตัวตน</span></div>
                </div>
            </div>

            {/* Items */}
            <table className="w-full border-collapse text-[10.5px] mt-1">
                <thead>
                    <tr className="border-y border-slate-800">
                        <th className="text-center font-bold py-1 px-1 w-6">#</th>
                        <th className="text-left font-bold py-1 px-1.5">รายการ</th>
                        <th className="text-center font-bold py-1 px-1 w-8">จน.</th>
                        <th className="text-right font-bold py-1 px-1.5 w-16">ราคา/หน่วย</th>
                        <th className="text-right font-bold py-1 px-1.5 w-20">จำนวนเงิน</th>
                    </tr>
                </thead>
                <tbody>
                    {data.tests.length === 0 ? (
                        <tr><td colSpan={5} className="text-center text-slate-400 py-3 italic">ไม่มีรายการ</td></tr>
                    ) : data.tests.map((it, idx) => (
                        <tr key={it.id} className="border-b border-slate-100">
                            <td className="text-center py-1 px-1 tabular-nums">{idx + 1}</td>
                            <td className="py-1 px-1.5">{it.test_name}<span className="text-[10px] text-slate-500 ml-1">({ITEM_TYPE_LABEL[it.item_type] || it.item_type})</span></td>
                            <td className="text-center py-1 px-1 tabular-nums">1</td>
                            <td className="text-right py-1 px-1.5 tabular-nums">{Number(it.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="text-right py-1 px-1.5 tabular-nums font-semibold">{Number(it.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-800">
                    <tr className="border-t border-slate-300 bg-slate-50">
                        <td colSpan={4} className="py-1 px-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-black text-[12px]">ยอดสุทธิ</span>
                                <span className="text-[9.5px] text-slate-600 italic">(ตัวอักษร: <span className="font-bold text-slate-800 not-italic">{bahtText(total)}</span>)</span>
                            </div>
                        </td>
                        <td className="text-right py-1 px-1.5 tabular-nums font-black text-[13px] align-middle">฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Payment / balance */}
            <div className="px-1 space-y-0.5">
                {data.paid ? (
                    <div className="text-[9.5px]"><span className="font-semibold text-slate-700">ชำระโดย: </span>{PAYMENT_METHOD_LABEL[data.payment_method || ""] || data.payment_method || "-"} ฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                ) : (
                    <div className="text-[9.5px] text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 inline-block">ค้างชำระ ฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                )}
            </div>

            <div className="flex-1" />

            {/* Signatures + footer */}
            <div>
                <div className="grid grid-cols-2 gap-8 px-2">
                    <div className="text-center"><div className="border-t border-slate-700 pt-1 text-[9.5px]"><div className="font-semibold">ผู้รับเงิน</div><div className="text-slate-600 text-[10px] mt-0.5">—</div></div></div>
                    <div className="text-center"><div className="border-t border-slate-700 pt-1 text-[9.5px]"><div className="font-semibold">ผู้รับใบเสร็จ</div><div className="text-slate-600 text-[10px] mt-0.5">—</div></div></div>
                </div>
                <div className="text-center text-[10px] text-slate-500 mt-1.5 pt-1 border-t border-dashed border-slate-300">ขอบคุณที่ใช้บริการ · เอกสารไม่ระบุตัวตน</div>
            </div>
        </div>
    );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
            <div className={`text-[15px] font-bold ${mono ? "font-mono" : ""}`}>{value}</div>
        </div>
    );
}

function InfoCell({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
    return (
        <div className="px-2 py-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
            <div className={`text-[14px] font-bold leading-tight mt-0.5 ${mono ? "font-mono" : ""} ${accent ? "text-[#0891b2]" : "text-slate-900"}`}>{value}</div>
        </div>
    );
}
