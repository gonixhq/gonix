import { createClient } from "@/lib/supabase/server";
import { getCommissionDaily } from "@/lib/actions/commissions";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
    doctor: "หมอ", nurse: "พยาบาล", assistant: "ผู้ช่วย",
    sales: "เซลล์คอส", affiliate: "เซลล์", referral: "ผู้แนะนำ",
};
const baht = (n: number) => `฿${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default async function CommissionDailyPrintPage({
    params,
}: {
    params: Promise<{ date: string }>;
}) {
    const { date } = await params;
    const data = await getCommissionDaily(date);

    const supabase = await createClient();
    const { data: clinic } = await supabase
        .from("tenants")
        .select("clinic_name, clinic_name_en, address_detail, phone")
        .limit(1).maybeSingle();

    const fmtDate = new Date(date + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}>
                <PrintTrigger />
            </div>

            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                {/* MASTHEAD */}
                <div style={{ borderTop: "4px double #000", borderBottom: "2px solid #000", padding: "8px 0" }}>
                    <div className="flex items-start justify-between gap-5">
                        <div className="flex items-center gap-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/clinic-logo.png" alt="Clinic" className="h-20 w-20 object-contain shrink-0" />
                            <div className="leading-tight">
                                <div className="text-[18px] font-black tracking-tight">{clinic?.clinic_name || "—"}</div>
                                {clinic?.clinic_name_en && <div className="text-[13px] font-semibold text-slate-800 mt-0.5">{clinic.clinic_name_en}</div>}
                                {clinic?.address_detail && <div className="text-[12px] text-slate-700 mt-1 leading-relaxed">{clinic.address_detail}</div>}
                                {clinic?.phone && <div className="text-[12px] text-slate-700">โทรศัพท์ {clinic.phone}</div>}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold text-slate-600">Daily Commission</div>
                            <h1 className="text-[22px] font-black tracking-tight text-black leading-tight mt-1">รายงานค่ามือ (รายวัน)</h1>
                            <div className="text-[13px] italic text-slate-700">{fmtDate}</div>
                        </div>
                    </div>
                </div>

                {/* สรุปต่อคน */}
                {data.byStaff.length > 0 && (
                    <div className="mt-4">
                        <h2 className="text-[14px] font-black tracking-wider mb-2">สรุปต่อคน</h2>
                        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "2px solid #000" }}>
                                    <th className="text-left py-1.5 px-2 font-bold">ผู้รับ</th>
                                    <th className="text-left py-1.5 px-2 font-bold">บทบาท</th>
                                    <th className="text-center py-1.5 px-2 font-bold">จำนวนเคส</th>
                                    <th className="text-right py-1.5 px-2 font-bold">รวมค่ามือ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.byStaff.map((s, i) => (
                                    <tr key={i} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                        <td className="py-1.5 px-2 font-semibold">{s.staff_name}</td>
                                        <td className="py-1.5 px-2">{ROLE_LABEL[s.role] || s.role}</td>
                                        <td className="py-1.5 px-2 text-center tabular-nums">{s.count}</td>
                                        <td className="py-1.5 px-2 text-right font-bold tabular-nums">{baht(s.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: "2px solid #000" }}>
                                    <td colSpan={3} className="py-2 px-2 text-right font-bold uppercase tracking-wider">รวมทั้งวัน</td>
                                    <td className="py-2 px-2 text-right font-black text-[15px] tabular-nums">{baht(data.total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* รายละเอียดต่อเคส */}
                <div className="mt-5">
                    <h2 className="text-[14px] font-black tracking-wider mb-2">รายละเอียดต่อเคส</h2>
                    {data.entries.length === 0 ? (
                        <p className="text-center text-slate-400 italic py-6">ไม่มีค่ามือในวันนี้</p>
                    ) : (
                        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "2px solid #000" }}>
                                    <th className="text-left py-1.5 px-1.5 font-bold">ผู้รับ</th>
                                    <th className="text-left py-1.5 px-1.5 font-bold">บทบาท</th>
                                    <th className="text-left py-1.5 px-1.5 font-bold">เคส/บิล</th>
                                    <th className="text-left py-1.5 px-1.5 font-bold">ลูกค้า</th>
                                    <th className="text-left py-1.5 px-1.5 font-bold">รายการ</th>
                                    <th className="text-right py-1.5 px-1.5 font-bold">ยอดขาย</th>
                                    <th className="text-right py-1.5 px-1.5 font-bold">ค่ามือ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.entries.map((e, i) => (
                                    <tr key={i} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                        <td className="py-1.5 px-1.5 font-semibold">{e.staff_name}</td>
                                        <td className="py-1.5 px-1.5">{ROLE_LABEL[e.role] || e.role}</td>
                                        <td className="py-1.5 px-1.5 font-mono text-[10px]">{e.vn || (e.inv_id ? "บิล" : "—")}</td>
                                        <td className="py-1.5 px-1.5">{e.patient_name}</td>
                                        <td className="py-1.5 px-1.5">{e.item_name}{e.qty > 1 ? ` ×${e.qty}` : ""}</td>
                                        <td className="py-1.5 px-1.5 text-right tabular-nums">{e.sale_amount ? baht(e.sale_amount) : "—"}</td>
                                        <td className="py-1.5 px-1.5 text-right font-bold tabular-nums">{baht(e.commission_amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="mt-8 grid grid-cols-2 gap-16 text-[12px]">
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="text-[10px] italic text-slate-600">ผู้จัดทำ</div>
                    </div>
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="text-[10px] italic text-slate-600">ผู้อนุมัติ / ผู้จัดการ</div>
                    </div>
                </div>

                <div className="mt-4 text-[10px] text-slate-500 text-center italic">
                    รายงานนี้สร้างจากระบบ Gonix — พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
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
