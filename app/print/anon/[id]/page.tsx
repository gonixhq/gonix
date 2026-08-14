import { gatePermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { getAnonCase, type AnonCaseFull, type AnonTest } from "@/lib/actions/anonymous";
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
const RESULT_EN: Record<string, string> = {
    pending: "Pending", sent_out: "Sent for confirmation",
    negative: "Negative", positive: "Positive", inconclusive: "Inconclusive",
};
function dmyShort(d: string): string {
    if (!d) return "—";
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${(y || "").slice(2)}`;
}
function dtBkk(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
    const z = (n: number) => String(n).padStart(2, "0");
    return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
}
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

    // ── RESULT (ใบรายงานผล Laboratory Report) — แยกใบตาม Sample Type ──
    const labTests = data.tests.filter((t) => isLabType(t.item_type));
    const sexTitle = data.sex === "female" ? "Ms." : data.sex === "male" ? "Mr." : "";
    const clinicName = clinic?.clinic_name || "—";
    const grpMap = new Map<string, AnonTest[]>();
    for (const t of labTests) {
        const key = String(t.sample_type || data.sample_type || "").trim();
        const arr = grpMap.get(key) || [];
        arr.push(t); grpMap.set(key, arr);
    }
    const groups = [...grpMap.entries()].map(([label, tests]) => ({ key: label || "_none", label, tests }));
    if (groups.length === 0) groups.push({ key: "_none", label: String(data.sample_type || ""), tests: [] });
    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            {groups.map((grp, idx) => (
                <AnonReportSheet key={grp.key} data={data} clinic={clinic} sexTitle={sexTitle} clinicName={clinicName} tests={grp.tests} sampleType={grp.label} notLast={idx < groups.length - 1} />
            ))}
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

// ── ใบผลนิรนาม 1 หน้า (ต่อ 1 Sample Type) ──
function AnonReportSheet({ data, clinic, sexTitle, clinicName, tests, sampleType, notLast }: {
    data: AnonCaseFull; clinic: Clinic; sexTitle: string; clinicName: string;
    tests: AnonTest[]; sampleType: string; notLast: boolean;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = (data.lab_report_meta && data.lab_report_meta[sampleType]) || {};
    return (
        <>
            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", pageBreakAfter: notLast ? "always" : "auto" }}>
                <ClinicMasthead clinic={clinic} />
                <div className="flex justify-end items-center gap-2.5 mt-1.5">
                    <div className="text-[9px] text-slate-600 text-right leading-tight">
                        <div>Tested at an ISO 15189</div>
                        <div className="font-semibold text-slate-700">accredited laboratory</div>
                    </div>
                    <img src="/accredit-ilac.png" alt="ilac-MRA" style={{ height: "34px", width: "auto", filter: "grayscale(100%)" }} />
                    <img src="/accredit-dmsc.png" alt="DMSc QA" style={{ height: "34px", width: "auto", filter: "grayscale(100%)" }} />
                </div>
                <div className="text-center mt-3" style={{ fontSize: "18px", fontWeight: 900 }}>
                    Laboratory Report<span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}> · ใบรายงานผลตรวจ (นิรนาม)</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]" style={{ borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1", padding: "10px 2px" }}>
                    <RptField label="Patient Name" value={`${sexTitle} ${data.verify_code || data.case_code || ""}`.trim()} />
                    <RptField label="HN / PID" value="—" />
                    <RptField label="Sex" value={data.sex ? SEX_LABEL[data.sex] || data.sex : "—"} />
                    <RptField label="Age" value={data.age != null ? `${data.age} ปี` : "—"} />
                    <RptField label="Clinic / Hosp" value={clinicName} />
                    <RptField label="LAB No." value={(m.lab_no || data.lab_no) || "—"} mono />
                    <RptField label="Sample Type" value={sampleType || "—"} />
                    <RptField label="Requested Date" value={dmyShort(data.case_date)} />
                    <RptField label="Collected Date/Time" value={dtBkk(m.collected_at || data.collected_at)} />
                    <RptField label="Received Date/Time" value={dtBkk(m.received_at || data.received_at)} />
                </div>

                <div className="mt-4">
                    <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid #0891b2", background: "#ecfeff" }} className="text-left">
                                <th className="py-2 px-2 font-black" style={{ width: "58%" }}>Lab Test <span className="text-[10px] font-semibold text-slate-500">รายการตรวจ</span></th>
                                <th className="py-2 px-2 font-black">Results <span className="text-[10px] font-semibold text-slate-500">ผลตรวจ</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {tests.map((t, i) => {
                                const pos = t.result_status === "positive";
                                const main = t.result_value || RESULT_EN[t.result_status] || "Pending";
                                const enWord = RESULT_EN[t.result_status] || "";
                                const showEn = t.result_status !== "pending" && t.result_status !== "sent_out" && !!enWord && String(t.result_value || "").toLowerCase() !== enWord.toLowerCase();
                                return (
                                    <tr key={t.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 ? "#f8fafc" : "#fff" }}>
                                        <td className="py-2 px-2 font-semibold align-top">{t.item_type === "lab_external" ? "*" : ""}{t.test_name}</td>
                                        <td className="py-2 px-2 align-top">
                                            <span style={{ fontWeight: 700, color: pos ? "#be123c" : "#0f172a" }}>{main}</span>
                                            {showEn ? <span className="text-slate-400 text-[11px]"> · {enWord}</span> : null}
                                            {t.result_note ? <div className="text-slate-500 text-[10.5px] mt-0.5">{t.result_note}</div> : null}
                                        </td>
                                    </tr>
                                );
                            })}
                            {tests.length === 0 && <tr><td colSpan={2} className="py-3 px-2 text-slate-400 italic">ยังไม่มีรายการตรวจ Lab</td></tr>}
                        </tbody>
                    </table>

                    <p className="mt-2 text-[10.5px] text-slate-600">(*) เทสที่มีเครื่องหมาย * ส่งตรวจที่ห้องปฏิบัติการที่ได้รับการรับรอง ISO 15189</p>

                    <div className="mt-3 text-[11.5px] flex gap-2">
                        <span className="font-bold shrink-0">Comment :</span>
                        <span className="flex-1" style={{ borderBottom: "1px dotted #94a3b8", minHeight: "16px" }}>{m.comment ?? data.lab_comment ?? ""}</span>
                    </div>
                    {data.result_appt_date && <p className="mt-2 text-[11.5px]">นัดฟังผล/ติดตาม: <b>{dateThaiLong(data.result_appt_date)}</b></p>}
                    <p className="mt-3 text-[10.5px] text-slate-500 italic leading-relaxed">
                        * เอกสารไม่ระบุตัวตน — กรุณาเก็บรหัสเคสไว้เพื่อติดตามผลและรับคำปรึกษา ผลตรวจควรได้รับการแปลผลจากบุคลากรทางการแพทย์
                    </p>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-16 text-[12px]">
                    <SignBlock role="Reported By · ผู้รายงานผล" name={m.reported_by_name ?? data.reported_by_name} license={m.reported_by_license ?? data.reported_by_license} at={m.reported_at ?? data.reported_at} />
                    <SignBlock role="Approved By · ผู้ตรวจสอบ" name={m.approved_by_name ?? data.approved_by_name} license={m.approved_by_license ?? data.approved_by_license} at={m.approved_at ?? data.approved_at} />
                </div>
            </div>
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
            <ClinicMasthead clinic={clinic} taxId={clinic?.tax_id || "0505569001439"} />
            <div className="flex items-end justify-between mt-1.5 px-1">
                <div>
                    <span className="text-[13px] font-black">ใบเสร็จรับเงิน · Receipt</span>
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
                            <td className="py-1 px-1.5">{it.test_name}</td>
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

function RptField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <span className="text-slate-500 shrink-0">{label} :</span>
            <span className={`flex-1 font-semibold ${mono ? "font-mono" : ""}`} style={{ borderBottom: "1px dotted #cbd5e1" }}>{value}</span>
        </div>
    );
}

function SignBlock({ role, name, license, at }: { role: string; name: string | null; license: string | null; at: string | null }) {
    return (
        <div className="text-center">
            <div style={{ borderBottom: "1px solid #000" }} className="h-9 mb-1 flex items-end justify-center pb-1">
                <span className="text-[12px] font-semibold">{name || ""}{license ? `  ${license}` : ""}</span>
            </div>
            <div className="text-[10px] italic text-slate-600">{role}</div>
            {at ? <div className="text-[10px] text-slate-500 mt-0.5">{dtBkk(at)}</div> : null}
        </div>
    );
}
