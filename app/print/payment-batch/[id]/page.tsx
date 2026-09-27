import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import { ClinicMasthead } from "@/app/print/clinic-masthead";
import { bahtText } from "@/lib/baht-text";
import { PAY_METHODS } from "@/lib/payables";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (d: string) => { const x = new Date(d); return `${x.getDate()} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][x.getMonth()]} ${x.getFullYear() + 543}`; };
const STATUS: Record<string, string> = { prepared: "รออนุมัติ", approved: "อนุมัติแล้ว", paid: "ชำระแล้ว", cancelled: "ยกเลิก" };

async function load(id: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: me } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!me?.clinic_id) return null;
    const { data: b } = await supabase.from("payment_batches").select("*").eq("id", id).eq("clinic_id", me.clinic_id).maybeSingle();
    if (!b) return null;
    const [{ data: bills }, { data: t }, { data: v }, { data: people }] = await Promise.all([
        supabase.from("vendor_bills").select("invoice_no, doc_type, bill_date, due_date, amount, wht_amount, note, lines, vendor").eq("batch_id", id).order("bill_date"),
        supabase.from("tenants").select("clinic_name, clinic_name_en, company_name, tax_id, address_detail, phone, license_number").eq("id", me.clinic_id).maybeSingle(),
        supabase.from("vendors").select("tax_id, address, branch").eq("clinic_id", me.clinic_id).eq("name", b.vendor).maybeSingle(),
        supabase.from("profiles").select("id, full_name").eq("clinic_id", me.clinic_id),
    ]);
    const nm = new Map((people || []).map(p => [p.id as string, p.full_name as string]));
    return { b, bills: bills || [], t, v, preparedBy: nm.get(b.prepared_by) || null, approvedBy: nm.get(b.approved_by) || null };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const d = await load(id);
    return { title: d ? `ใบเตรียมจ่าย_${d.b.batch_no}_${d.b.vendor}` : "ใบเตรียมจ่าย" };
}

// ใบเตรียมจ่าย / ใบสำคัญจ่าย (รวมหลายบิล)
export default async function PaymentBatchPrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const d = await load(id);
    if (!d) notFound();
    const { b, bills, t, v } = d;
    const net = Number(b.net_total), total = Number(b.total), wht = Number(b.wht_total);
    const method = PAY_METHODS.find(m => m.value === b.paid_method)?.label;
    const cell = { border: "1px solid #94a3b8", padding: "5px 8px" } as const;

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", fontSize: "12.5px" }}>
                <ClinicMasthead clinic={t} taxId={(t?.tax_id as string) || undefined} />
                <div className="flex items-end justify-between mt-4">
                    <div>
                        <div style={{ fontSize: "22px", fontWeight: 800 }}>{b.kind === "reimburse" ? "ใบคืนเงินสำรองจ่าย" : b.status === "paid" ? "ใบสำคัญจ่าย" : "ใบเตรียมจ่าย"}</div>
                        <div style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.2em" }}>{b.kind === "reimburse" ? "EXPENSE REIMBURSEMENT" : b.status === "paid" ? "PAYMENT VOUCHER" : "PAYMENT REQUEST"}</div>
                    </div>
                    <table style={{ fontSize: "12.5px" }}><tbody>
                        <tr><td className="pr-3 text-slate-600">เลขที่</td><td className="font-bold">{b.batch_no}</td></tr>
                        <tr><td className="pr-3 text-slate-600">วันที่เตรียม</td><td>{thaiDate(b.prepared_at)}</td></tr>
                        {b.pay_date && <tr><td className="pr-3 text-slate-600">กำหนดจ่าย</td><td>{thaiDate(b.pay_date)}</td></tr>}
                        <tr><td className="pr-3 text-slate-600">สถานะ</td><td className="font-semibold">{STATUS[b.status] || b.status}</td></tr>
                    </tbody></table>
                </div>

                <div className="mt-3" style={{ border: "1px solid #94a3b8", padding: "8px 10px", lineHeight: 1.7 }}>
                    <div><span className="text-slate-600">{b.kind === "reimburse" ? "คืนเงินให้ (ผู้สำรองจ่าย) " : "จ่ายให้ "}</span><b style={{ fontSize: "14px" }}>{b.vendor}</b>{v?.branch ? <span className="text-slate-600"> ({v.branch})</span> : null}</div>
                    <div><span className="text-slate-600">เลขประจำตัวผู้เสียภาษี/บัตรประชาชน </span>{v?.tax_id || "—"}</div>
                    {v?.address && <div><span className="text-slate-600">ที่อยู่ </span>{v.address}</div>}
                </div>

                <table className="w-full mt-3" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "#f1f5f9" }}>
                        <th style={{ ...cell, width: "34px" }}>ที่</th>
                        <th style={{ ...cell, width: "90px" }}>วันที่เอกสาร</th>
                        <th style={{ ...cell, width: "110px" }}>เลขที่เอกสาร</th>
                        <th style={{ ...cell, textAlign: "left" }}>รายละเอียด</th>
                        <th style={{ ...cell, width: "90px" }}>ครบกำหนด</th>
                        <th style={{ ...cell, width: "100px", textAlign: "right" }}>จำนวนเงิน</th>
                    </tr></thead>
                    <tbody>
                        {bills.map((x, i) => {
                            const lines = Array.isArray(x.lines) ? (x.lines as { description?: string }[]) : [];
                            const desc = (b.kind === "reimburse" ? `${x.vendor}: ` : "") + (x.note || lines.map(l => l.description).filter(Boolean).slice(0, 2).join(", ") || "—");
                            return (
                                <tr key={i}>
                                    <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                                    <td style={{ ...cell, textAlign: "center" }}>{thaiDate(x.bill_date)}</td>
                                    <td style={cell}>{x.invoice_no || "—"}</td>
                                    <td style={cell}>{desc}</td>
                                    <td style={{ ...cell, textAlign: "center" }}>{thaiDate(x.due_date)}</td>
                                    <td style={{ ...cell, textAlign: "right" }}>{money(Number(x.amount) - (b.kind === "reimburse" ? Number(x.wht_amount || 0) : 0))}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="flex justify-between gap-4 mt-2">
                    <div style={{ flex: 1, fontSize: "12px" }}>
                        {b.note && <div className="mb-1"><span className="text-slate-600">หมายเหตุ: </span>{b.note}</div>}
                        <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "6px 10px", borderRadius: "4px" }}>
                            <span className="text-slate-600">จำนวนเงิน (ตัวอักษร): </span><b>({bahtText(net)})</b>
                        </div>
                        <div className="mt-2">
                            <span className="text-slate-600">ชำระโดย: </span>
                            {["เงินสด", "โอน", "เช็ค"].map(m => <span key={m} className="mr-3">{method && method.startsWith(m) ? "☑" : "☐"} {m}</span>)}
                            {b.paid_ref && <span>อ้างอิง {b.paid_ref}</span>}
                            {b.paid_at && <span> · วันที่จ่าย {thaiDate(b.paid_at)}</span>}
                        </div>
                    </div>
                    <table style={{ fontSize: "12.5px", minWidth: "230px" }}><tbody>
                        <tr><td className="text-slate-600 pr-3">รวม {bills.length} เอกสาร</td><td className="text-right font-bold">{money(total)}</td></tr>
                        {wht > 0 && <tr><td className="text-slate-600 pr-3">หัก ณ ที่จ่าย</td><td className="text-right">−{money(wht)}</td></tr>}
                        <tr style={{ borderTop: "2px solid #000" }}><td className="pr-3 font-bold pt-1">ยอดจ่ายสุทธิ</td><td className="text-right font-black pt-1" style={{ fontSize: "15px" }}>{money(net)}</td></tr>
                    </tbody></table>
                </div>

                <div className="grid grid-cols-3 gap-6 mt-12 text-center" style={{ fontSize: "12px" }}>
                    {[
                        { t: "ผู้จัดทำ", n: d.preparedBy, dt: b.prepared_at },
                        { t: "ผู้อนุมัติ", n: d.approvedBy, dt: b.approved_at },
                        { t: "ผู้รับเงิน", n: b.vendor, dt: null },
                    ].map(s => (
                        <div key={s.t}>
                            <div style={{ borderBottom: "1px dotted #000", height: "30px" }} />
                            <div className="mt-1">({s.n || "......................................"})</div>
                            <div className="font-semibold">{s.t}</div>
                            <div className="text-slate-600 mt-1">วันที่ {s.dt ? thaiDate(s.dt) : "......../......../........"}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 text-[10px] text-slate-400 text-center">พิมพ์จากระบบ Gonix · {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>
            </div>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4; margin: 12mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-page { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
                }
                @media screen {
                    .print-page { background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.1); margin: 20px auto; padding: 12mm; }
                    body { background: #f1f5f9; }
                }
            `}</style>
        </>
    );
}
