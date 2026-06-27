import { getAffiliateWhtCert } from "@/lib/actions/affiliates";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function formatMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" });
}

export default async function WhtCertPrintPage({ params }: { params: Promise<{ month: string; affiliateId: string }> }) {
    const { month, affiliateId } = await params;
    const cert = await getAffiliateWhtCert(affiliateId, month);

    if (!cert.affiliate) {
        return <div className="p-10 text-center text-slate-500">ไม่พบข้อมูลค่าคอมของเซลล์ในเดือนนี้</div>;
    }
    const { clinic, affiliate, gross, wht, net } = cert;

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>

            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                {/* HEADER */}
                <div style={{ borderTop: "4px double #000", borderBottom: "2px solid #000", padding: "8px 0" }}>
                    <div className="flex items-start justify-between gap-5">
                        <div className="flex items-center gap-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/clinic-logo.png" alt="Clinic" className="h-20 w-20 object-contain shrink-0" />
                            <div className="leading-tight">
                                <div className="text-[18px] font-black tracking-tight">{clinic?.name || "—"}</div>
                                {clinic?.name_en && <div className="text-[13px] font-semibold text-slate-800 mt-0.5">{clinic.name_en}</div>}
                                {clinic?.address && <div className="text-[12px] text-slate-700 mt-1 leading-relaxed">{clinic.address}</div>}
                                {clinic?.phone && <div className="text-[12px] text-slate-700">โทรศัพท์ {clinic.phone}</div>}
                                {clinic?.tax_id && <div className="text-[12px] text-slate-700">เลขประจำตัวผู้เสียภาษี {clinic.tax_id}</div>}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold text-slate-600">Withholding Tax Certificate</div>
                            <h1 className="text-[20px] font-black tracking-tight text-black leading-tight mt-1">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
                            <div className="text-[11px] text-slate-600">(50 ทวิ) ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
                            <div className="text-[13px] italic text-slate-700 mt-0.5">{formatMonth(month)}</div>
                        </div>
                    </div>
                </div>

                {/* PARTIES */}
                <div className="grid grid-cols-2 gap-6 py-3" style={{ borderBottom: "1px solid #000" }}>
                    <div className="space-y-1 text-[13px]">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">ผู้จ่ายเงิน · Payer</div>
                        <div className="text-[15px] font-bold">{clinic?.name || "—"}</div>
                        {clinic?.tax_id && <div className="text-[12px] text-slate-600">เลขผู้เสียภาษี: {clinic.tax_id}</div>}
                    </div>
                    <div className="space-y-1 text-[13px] text-right">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">ผู้ถูกหักภาษี · Payee</div>
                        <div className="text-[15px] font-bold">{affiliate.name}</div>
                        <div className="text-[11px] text-slate-500 italic">เซลล์ฟรีแลนซ์ (เงินได้ตามมาตรา 40(2))</div>
                    </div>
                </div>

                {/* AMOUNTS */}
                <div className="mt-4">
                    <h2 className="text-[14px] font-black tracking-wider mb-2">รายละเอียดเงินได้และภาษีที่หัก</h2>
                    <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid #000" }}>
                                <th className="text-left py-1.5 px-2 font-bold">ประเภทเงินได้</th>
                                <th className="text-right py-1.5 px-2 font-bold">จำนวนเงินที่จ่าย</th>
                                <th className="text-right py-1.5 px-2 font-bold">ภาษีที่หัก (3%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                <td className="py-2.5 px-2">ค่าคอมมิชชั่น · {formatMonth(month)}</td>
                                <td className="py-2.5 px-2 text-right font-bold tabular-nums">{baht(gross)}</td>
                                <td className="py-2.5 px-2 text-right font-bold tabular-nums text-red-600">{baht(wht)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: "2px solid #000" }}>
                                <td className="py-2.5 px-2 text-right font-black uppercase tracking-wider">รวม</td>
                                <td className="py-2.5 px-2 text-right font-black tabular-nums">{baht(gross)}</td>
                                <td className="py-2.5 px-2 text-right font-black tabular-nums text-red-600">{baht(wht)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div className="mt-3 flex justify-end">
                        <div className="text-right">
                            <div className="text-[11px] text-slate-500">ยอดสุทธิที่จ่ายให้ผู้รับ (หลังหักภาษี)</div>
                            <div className="text-[20px] font-black tabular-nums">{baht(net)}</div>
                        </div>
                    </div>
                </div>

                {/* TAX CONDITION */}
                <div className="mt-4 text-[12px] text-slate-700 border border-slate-300 rounded p-3">
                    ผู้จ่ายเงินได้หักภาษี ณ ที่จ่ายในอัตราร้อยละ 3 ของเงินได้ และได้นำส่งภาษีที่หักไว้ตามแบบ ภ.ง.ด. ที่เกี่ยวข้องแล้ว
                    เอกสารฉบับนี้ออกให้เพื่อใช้เป็นหลักฐานในการยื่นแบบแสดงรายการภาษีเงินได้บุคคลธรรมดา
                </div>

                {/* SIGNATURES */}
                <div className="mt-10 grid grid-cols-2 gap-16 text-[12px]">
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="font-semibold">({affiliate.name})</div>
                        <div className="text-[10px] italic text-slate-600">ผู้รับเงิน</div>
                    </div>
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="font-semibold">(........................................)</div>
                        <div className="text-[10px] italic text-slate-600">ผู้จ่ายเงิน / ผู้มีอำนาจลงนาม</div>
                    </div>
                </div>

                <div className="mt-4 text-[10px] text-slate-500 text-center italic">
                    เอกสารนี้สร้างจากระบบ Gonix — พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </div>
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
