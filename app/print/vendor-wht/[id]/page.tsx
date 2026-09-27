import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import { getBillPrintData } from "@/lib/actions/bill-print";
import { bahtText } from "@/lib/baht-text";

export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (d: string) => { const x = new Date(d); return `${x.getDate()} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][x.getMonth()]} ${x.getFullYear() + 543}`; };
// ประเภทเงินได้ตามอัตราหัก (ตามที่ใช้บ่อยในคลินิก)
const INCOME: Record<number, { person: string; company: string }> = {
    1: { person: "ค่าขนส่ง (ม.3 เตรส)", company: "ค่าขนส่ง (ม.3 เตรส)" },
    2: { person: "ค่าโฆษณา (ม.3 เตรส)", company: "ค่าโฆษณา (ม.3 เตรส)" },
    3: { person: "ค่าจ้างทำของ / ค่าบริการ (ม.40(8), ม.3 เตรส)", company: "ค่าบริการ / ค่าจ้างทำของ (ม.3 เตรส)" },
    5: { person: "ค่าเช่าทรัพย์สิน (ม.40(5))", company: "ค่าเช่าทรัพย์สิน (ม.3 เตรส)" },
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const d = await getBillPrintData(id);
    return { title: d ? `50ทวิ_${d.vendor.name}_${d.bill.paid_at || d.bill.bill_date}` : "50 ทวิ" };
}

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) จากบิลค่าใช้จ่ายที่มีหัก ณ ที่จ่าย
export default async function VendorWhtCertPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const d = await getBillPrintData(id);
    if (!d) notFound();
    const { clinic, bill, vendor } = d;
    if (!(bill.wht_amount > 0)) return <div className="p-10 text-center text-slate-500">บิลนี้ไม่มีหัก ณ ที่จ่าย</div>;
    const payDate = bill.paid_at || bill.bill_date;
    const payer = clinic.company || clinic.name;
    const income = INCOME[bill.wht_pct]?.[vendor.isPerson ? "person" : "company"] || "เงินได้ตามมาตรา 3 เตรส";
    const box = { border: "1px solid #000", padding: "8px 10px" } as const;
    const cell = { border: "1px solid #000", padding: "6px 8px" } as const;

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", fontSize: "12.5px" }}>
                <div className="flex justify-between items-start">
                    <div style={{ fontSize: "11px" }}>ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</div>
                    <div style={{ fontSize: "11px" }}>เล่มที่ ....... เลขที่ .......</div>
                </div>
                <div className="text-center mt-2">
                    <div style={{ fontSize: "18px", fontWeight: 800 }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
                    <div style={{ fontSize: "11.5px" }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
                </div>

                <div className="mt-3" style={box}>
                    <div className="font-bold">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</div>
                    <div className="flex justify-between"><span>ชื่อ <b>{payer}</b></span><span>เลขประจำตัวผู้เสียภาษีอากร <b>{clinic.tax_id || "............................."}</b></span></div>
                    <div>ที่อยู่ {clinic.address || "................................................................................"}</div>
                </div>
                <div className="mt-2" style={box}>
                    <div className="font-bold">ผู้ถูกหักภาษี ณ ที่จ่าย :</div>
                    <div className="flex justify-between"><span>ชื่อ <b>{vendor.name}</b>{vendor.branch ? ` (${vendor.branch})` : ""}</span>
                        <span>{vendor.isPerson ? "เลขประจำตัวประชาชน" : "เลขประจำตัวผู้เสียภาษีอากร"} <b>{vendor.tax_id || "............................."}</b></span></div>
                    <div>ที่อยู่ {vendor.address || "................................................................................"}</div>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-6" style={{ fontSize: "12px" }}>
                    <span>ลำดับที่ ........ ในแบบ</span>
                    <span>{vendor.isPerson ? "☑" : "☐"} ภ.ง.ด.3</span>
                    <span>{vendor.isPerson ? "☐" : "☑"} ภ.ง.ด.53</span>
                    <span>☐ ภ.ง.ด.1ก</span><span>☐ ภ.ง.ด.2</span>
                </div>

                <table className="w-full mt-2" style={{ borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                            <th style={{ ...cell, textAlign: "left" }}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
                            <th style={{ ...cell, width: "110px" }}>วัน เดือน ปี ที่จ่าย</th>
                            <th style={{ ...cell, width: "120px", textAlign: "right" }}>จำนวนเงินที่จ่าย</th>
                            <th style={{ ...cell, width: "120px", textAlign: "right" }}>ภาษีที่หักและนำส่งไว้</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={cell}>{income}<div className="text-[11px] text-slate-600">{bill.lines.map(l => l.description).slice(0, 3).join(", ")}{bill.invoice_no ? ` · อ้างอิง ${bill.invoice_no}` : ""}</div></td>
                            <td style={{ ...cell, textAlign: "center" }}>{thaiDate(payDate)}</td>
                            <td style={{ ...cell, textAlign: "right" }}>{money(bill.subtotal)}</td>
                            <td style={{ ...cell, textAlign: "right" }}>{money(bill.wht_amount)}</td>
                        </tr>
                        <tr>
                            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={2}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
                            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{money(bill.subtotal)}</td>
                            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{money(bill.wht_amount)}</td>
                        </tr>
                    </tbody>
                </table>
                <div className="mt-2" style={box}>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <b>({bahtText(bill.wht_amount)})</b></div>

                <div className="mt-2 flex flex-wrap gap-x-6" style={{ fontSize: "12px" }}>
                    <span>ผู้จ่ายเงิน</span><span>☑ (1) หัก ณ ที่จ่าย</span><span>☐ (2) ออกให้ตลอดไป</span><span>☐ (3) ออกให้ครั้งเดียว</span>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-10" style={{ fontSize: "12px" }}>
                    <div style={{ ...box, fontSize: "11px", color: "#334155" }}>
                        <b>คำเตือน</b> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
                    </div>
                    <div className="text-center">
                        <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
                        <div className="mt-8" style={{ borderBottom: "1px dotted #000", height: "20px" }} />
                        <div className="mt-1">ลงชื่อ ................................................ ผู้จ่ายเงิน</div>
                        <div className="mt-1">วันที่ {thaiDate(payDate)}</div>
                        <div className="text-[11px] text-slate-500 mt-1">(ประทับตรานิติบุคคล ถ้ามี)</div>
                    </div>
                </div>
                <div className="mt-4 text-[10px] text-slate-400 text-center">พิมพ์จากระบบ Gonix · ตรวจสอบรูปแบบกับสำนักงานบัญชีก่อนใช้งานจริง</div>
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
