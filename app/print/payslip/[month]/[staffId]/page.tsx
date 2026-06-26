import { getPayslip } from "@/lib/actions/compensation";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของ", admin: "แอดมิน", doctor: "แพทย์", dentist: "ทันตแพทย์",
    nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "นักกายภาพบำบัด", receptionist: "เจ้าหน้าที่ต้อนรับ",
    accountant: "เจ้าหน้าที่บัญชี", assistant: "ผู้ช่วย", staff: "พนักงาน",
};
const roleLabel = (r: string) => ROLE_LABEL[r] || r || "พนักงาน";
const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function formatMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" });
}

export default async function PayslipPrintPage({
    params,
}: {
    params: Promise<{ month: string; staffId: string }>;
}) {
    const { month, staffId } = await params;
    const { staff, attendance, clinic, payout } = await getPayslip(staffId, month);

    if (!staff) {
        return <div className="p-10 text-center text-slate-500">ไม่พบข้อมูลค่าตอบแทนของพนักงานในเดือนนี้</div>;
    }

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
                                {clinic?.clinic_name_en && (
                                    <div className="text-[13px] font-semibold text-slate-800 mt-0.5">{clinic.clinic_name_en}</div>
                                )}
                                {clinic?.address_detail && (
                                    <div className="text-[12px] text-slate-700 mt-1 leading-relaxed">{clinic.address_detail}</div>
                                )}
                                {clinic?.phone && (
                                    <div className="text-[12px] text-slate-700">โทรศัพท์ {clinic.phone}</div>
                                )}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold text-slate-600">Payslip</div>
                            <h1 className="text-[22px] font-black tracking-tight text-black leading-tight mt-1">ใบจ่ายค่าตอบแทน</h1>
                            <div className="text-[13px] italic text-slate-700">{formatMonth(month)}</div>
                        </div>
                    </div>
                </div>

                {/* Staff Info */}
                <div className="grid grid-cols-2 gap-6 py-3" style={{ borderBottom: "1px solid #000" }}>
                    <div className="space-y-1 text-[13px]">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">พนักงาน · Staff</div>
                        <div className="text-[16px] font-bold">{staff.name}</div>
                        <div className="text-[12px] text-slate-600">ตำแหน่ง: <span className="font-semibold">{roleLabel(staff.role)}</span></div>
                    </div>
                    <div className="space-y-1 text-[13px] text-right">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">งวด · Period</div>
                        <div className="text-[16px] font-bold">{formatMonth(month)}</div>
                        {attendance && (
                            <div className="text-[12px] text-slate-600">
                                มาทำงาน <span className="font-bold tabular-nums">{attendance.worked_days}</span> วัน
                                {attendance.absent_days > 0 && <> · ขาด <span className="font-bold tabular-nums">{attendance.absent_days}</span></>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Earnings */}
                <div className="mt-4">
                    <h2 className="text-[14px] font-black tracking-wider mb-2">รายการค่าตอบแทน</h2>
                    <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid #000" }}>
                                <th className="text-left py-1.5 px-2 font-bold">รายการ</th>
                                <th className="text-right py-1.5 px-2 font-bold">รายละเอียด</th>
                                <th className="text-right py-1.5 px-2 font-bold">จำนวนเงิน</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                <td className="py-2 px-2">{staff.pay_type === "monthly" ? "เงินเดือน" : "ค่าตอบแทนตามเวลาทำงาน"}</td>
                                <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                                    {staff.pay_type === "monthly" ? (
                                        <span className="text-[11px] text-slate-400">เหมาจ่ายรายเดือน</span>
                                    ) : (
                                        <>
                                            {staff.pay_hours} ชม. × {baht(staff.hourly_rate)}
                                            <span className="text-[11px] text-slate-400"> ({staff.has_actual ? "จากเวลาจริง" : "จากเวร"})</span>
                                        </>
                                    )}
                                </td>
                                <td className="py-2 px-2 text-right font-bold tabular-nums">{baht(staff.time_pay)}</td>
                            </tr>
                            <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                <td className="py-2 px-2">ค่า DF / Commission</td>
                                <td className="py-2 px-2 text-right tabular-nums text-slate-600">เดือน {formatMonth(month)}</td>
                                <td className="py-2 px-2 text-right font-bold tabular-nums">{baht(staff.df)}</td>
                            </tr>
                            {payout && payout.adjustment !== 0 && (
                                <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                    <td className="py-2 px-2">ปรับยอด (หัก/เพิ่มโดยผู้จ่าย)</td>
                                    <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                                        {attendance && attendance.absent_days > 0 ? `ขาดงาน ${attendance.absent_days} วัน` : "—"}
                                    </td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums">{payout.adjustment > 0 ? "+" : ""}{baht(payout.adjustment)}</td>
                                </tr>
                            )}
                            {/* รายการหัก */}
                            {staff.wht > 0 && (
                                <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                    <td className="py-2 px-2">หัก ณ ที่จ่าย 3%</td>
                                    <td className="py-2 px-2 text-right tabular-nums text-slate-600">—</td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums text-red-600">−{baht(staff.wht)}</td>
                                </tr>
                            )}
                            {staff.sso > 0 && (
                                <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                    <td className="py-2 px-2">ประกันสังคม 5%</td>
                                    <td className="py-2 px-2 text-right tabular-nums text-slate-600">เพดาน 750</td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums text-red-600">−{baht(staff.sso)}</td>
                                </tr>
                            )}
                            {staff.other_deduction > 0 && (
                                <tr style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                    <td className="py-2 px-2">หักอื่นๆ (มาสาย/ลา/ขาด)</td>
                                    <td className="py-2 px-2 text-right tabular-nums text-slate-600">—</td>
                                    <td className="py-2 px-2 text-right font-bold tabular-nums text-red-600">−{baht(staff.other_deduction)}</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: "2px solid #000" }}>
                                <td colSpan={2} className="py-2.5 px-2 text-right font-black uppercase tracking-wider">ยอดสุทธิที่จ่าย</td>
                                <td className="py-2.5 px-2 text-right font-black text-[16px] tabular-nums">{baht(payout ? payout.net_amount : staff.net)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {staff.is_paid && staff.paid_at && (
                    <div className="mt-3 inline-block border-2 border-emerald-500 text-emerald-600 rounded px-3 py-1 text-[12px] font-bold" style={{ transform: "rotate(-2deg)" }}>
                        ✓ จ่ายแล้ว · {new Date(staff.paid_at).toLocaleDateString("th-TH", { dateStyle: "medium" })}
                    </div>
                )}

                {/* Attendance detail */}
                {attendance && (
                    <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                        {[
                            { label: "วันเข้าเวร", value: attendance.planned_days },
                            { label: "วันมาทำงาน", value: attendance.worked_days },
                            { label: "ขาดงาน", value: attendance.absent_days },
                            { label: "ชั่วโมงจริง", value: attendance.actual_hours },
                        ].map((b) => (
                            <div key={b.label} className="border border-slate-300 rounded p-2">
                                <div className="text-[18px] font-black tabular-nums">{b.value}</div>
                                <div className="text-[10px] text-slate-500">{b.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Signatures */}
                <div className="mt-10 grid grid-cols-2 gap-16 text-[12px]">
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="font-semibold">({staff.name})</div>
                        <div className="text-[10px] italic text-slate-600">ผู้รับเงิน</div>
                    </div>
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="font-semibold">(........................................)</div>
                        <div className="text-[10px] italic text-slate-600">ผู้จ่ายเงิน / ผู้จัดการ</div>
                    </div>
                </div>

                <div className="mt-4 text-[10px] text-slate-500 text-center italic">
                    ใบจ่ายนี้สร้างจากระบบ Gonix — พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
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
                    .print-page {
                        background: white;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                        margin: 20px auto;
                        padding: 12mm;
                    }
                    body { background: #f1f5f9; }
                }
            `}</style>
        </>
    );
}
