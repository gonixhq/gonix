import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import { ClinicMasthead } from "@/app/print/clinic-masthead";
import { getBillPrintData } from "@/lib/actions/bill-print";
import { bahtText } from "@/lib/baht-text";
import { PAY_METHODS } from "@/lib/payables";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (d: string) => { const x = new Date(d); return `${x.getDate()} ${["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"][x.getMonth()]} ${x.getFullYear() + 543}`; };
const pvNo = (id: string, date: string) => `PV${date.replace(/-/g, "").slice(2)}-${id.slice(0, 4).toUpperCase()}`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const d = await getBillPrintData(id);
    return { title: d ? `ใบสำคัญจ่าย_${pvNo(d.bill.id, d.bill.paid_at || d.bill.bill_date)}_${d.vendor.name}` : "ใบสำคัญจ่าย" };
}

// ใบสำคัญจ่าย (Payment Voucher) — ใช้เป็นหลักฐานการจ่ายแทนใบเสร็จ เมื่อผู้รับเงินเป็นบุคคลธรรมดาที่ออกใบเสร็จไม่ได้
export default async function PaymentVoucherPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const d = await getBillPrintData(id);
    if (!d) notFound();
    const { clinic, bill, vendor } = d;
    const payDate = bill.paid_at || bill.bill_date;
    const method = PAY_METHODS.find(m => m.value === bill.paid_method)?.label;
    const cell = { border: "1px solid #94a3b8", padding: "6px 8px" } as const;

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", fontSize: "13px" }}>
                <ClinicMasthead clinic={{ clinic_name: clinic.name, clinic_name_en: clinic.name_en, company_name: clinic.company, address_detail: clinic.address, phone: clinic.phone, license_number: clinic.license }} taxId={clinic.tax_id || undefined} />

                <div className="flex items-end justify-between mt-4">
                    <div>
                        <div style={{ fontSize: "22px", fontWeight: 800 }}>ใบสำคัญจ่าย</div>
                        <div style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.2em" }}>PAYMENT VOUCHER</div>
                    </div>
                    <table style={{ fontSize: "12.5px" }}>
                        <tbody>
                            <tr><td className="pr-3 text-slate-600">เลขที่</td><td className="font-bold">{pvNo(bill.id, payDate)}</td></tr>
                            <tr><td className="pr-3 text-slate-600">วันที่</td><td className="font-bold">{thaiDate(payDate)}</td></tr>
                            {bill.invoice_no && <tr><td className="pr-3 text-slate-600">อ้างอิงเอกสาร</td><td>{bill.invoice_no}</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="mt-3 rounded" style={{ border: "1px solid #94a3b8", padding: "8px 10px", lineHeight: 1.7 }}>
                    <div><span className="text-slate-600">จ่ายให้ </span><b style={{ fontSize: "14px" }}>{vendor.name}</b>{vendor.branch && <span className="text-slate-600"> ({vendor.branch})</span>}</div>
                    <div><span className="text-slate-600">{vendor.isPerson ? "เลขประจำตัวประชาชน" : "เลขประจำตัวผู้เสียภาษี"} </span>{vendor.tax_id || "............................................."}</div>
                    <div><span className="text-slate-600">ที่อยู่ </span>{vendor.address || ".........................................................................................................................."}</div>
                </div>

                <table className="w-full mt-3" style={{ borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                            <th style={{ ...cell, width: "40px" }}>ที่</th>
                            <th style={{ ...cell, textAlign: "left" }}>รายการ</th>
                            <th style={{ ...cell, width: "60px" }}>จำนวน</th>
                            <th style={{ ...cell, width: "100px", textAlign: "right" }}>ราคา/หน่วย</th>
                            <th style={{ ...cell, width: "110px", textAlign: "right" }}>จำนวนเงิน</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bill.lines.map((l, i) => (
                            <tr key={i}>
                                <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                                <td style={cell}>{l.description}</td>
                                <td style={{ ...cell, textAlign: "center" }}>{l.qty}</td>
                                <td style={{ ...cell, textAlign: "right" }}>{money(l.unit_price)}</td>
                                <td style={{ ...cell, textAlign: "right" }}>{money(l.amount)}</td>
                            </tr>
                        ))}
                        {Array.from({ length: Math.max(0, 4 - bill.lines.length) }).map((_, i) => (
                            <tr key={`e${i}`}><td style={{ ...cell, height: "28px" }} /><td style={cell} /><td style={cell} /><td style={cell} /><td style={cell} /></tr>
                        ))}
                    </tbody>
                </table>

                <div className="flex justify-between gap-4 mt-2">
                    <div style={{ flex: 1, fontSize: "12px" }}>
                        {bill.note && <div className="mb-1"><span className="text-slate-600">หมายเหตุ: </span>{bill.note}</div>}
                        <div className="rounded" style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "6px 10px" }}>
                            <span className="text-slate-600">จำนวนเงิน (ตัวอักษร): </span><b>({bahtText(bill.net_pay)})</b>
                        </div>
                        <div className="mt-2">
                            <span className="text-slate-600">ชำระโดย: </span>
                            {["เงินสด", "โอน", "เช็ค"].map(m => <span key={m} className="mr-3">{method && method.startsWith(m) ? "☑" : "☐"} {m}</span>)}
                            {bill.paid_ref && <span>เลขที่อ้างอิง {bill.paid_ref}</span>}
                        </div>
                    </div>
                    <table style={{ fontSize: "12.5px", minWidth: "240px" }}>
                        <tbody>
                            {bill.discount > 0 && <tr><td className="text-slate-600 pr-3">ส่วนลด</td><td className="text-right">−{money(bill.discount)}</td></tr>}
                            {bill.vat_amount > 0 && <><tr><td className="text-slate-600 pr-3">มูลค่าก่อนภาษี</td><td className="text-right">{money(bill.subtotal)}</td></tr>
                                <tr><td className="text-slate-600 pr-3">ภาษีมูลค่าเพิ่ม 7%</td><td className="text-right">{money(bill.vat_amount)}</td></tr></>}
                            <tr><td className="text-slate-600 pr-3">รวมทั้งสิ้น</td><td className="text-right font-bold">{money(bill.amount)}</td></tr>
                            {bill.wht_amount > 0 && <tr><td className="text-slate-600 pr-3">หัก ณ ที่จ่าย {bill.wht_pct}%</td><td className="text-right">−{money(bill.wht_amount)}</td></tr>}
                            <tr style={{ borderTop: "2px solid #000" }}><td className="pr-3 font-bold pt-1">ยอดจ่ายสุทธิ</td><td className="text-right font-black pt-1" style={{ fontSize: "15px" }}>{money(bill.net_pay)}</td></tr>
                        </tbody>
                    </table>
                </div>

                {/* ลายเซ็น */}
                <div className="grid grid-cols-3 gap-6 mt-12 text-center" style={{ fontSize: "12px" }}>
                    {[
                        { t: "ผู้จัดทำ", n: d.preparedBy },
                        { t: "ผู้อนุมัติ", n: null },
                        { t: "ผู้รับเงิน", n: vendor.name, sub: "ได้รับเงินตามรายการข้างต้นถูกต้องแล้ว" },
                    ].map(s => (
                        <div key={s.t}>
                            {s.sub && <div className="text-[10.5px] text-slate-600 mb-6">{s.sub}</div>}
                            {!s.sub && <div className="mb-6" style={{ height: "15px" }} />}
                            <div style={{ borderBottom: "1px dotted #000", height: "22px" }} />
                            <div className="mt-1">({s.n || "......................................"})</div>
                            <div className="font-semibold">{s.t}</div>
                            <div className="text-slate-600 mt-1">วันที่ ......../......../........</div>
                        </div>
                    ))}
                </div>

                {vendor.isPerson && (
                    <div className="mt-8 rounded" style={{ border: "1.5px dashed #94a3b8", padding: "10px", minHeight: "150px", fontSize: "11px", color: "#64748b" }}>
                        <b className="text-slate-700">แนบสำเนาบัตรประจำตัวประชาชนผู้รับเงิน</b> — พร้อมลงนามรับรองสำเนาถูกต้อง
                        <div className="text-center mt-10">(ติด/แนบสำเนาบัตรประชาชนที่นี่)</div>
                    </div>
                )}

                <div className="mt-4 text-[10px] text-slate-400 text-center">พิมพ์จากระบบ Gonix · {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>
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
