import { createClient } from "@/lib/supabase/server";
import { getCommissionDetail } from "@/lib/actions/commissions";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
    doctor: "แพทย์",
    nurse: "พยาบาล",
    assistant: "ผู้ช่วย",
    sales: "เซลล์",
    other: "อื่นๆ",
};

function formatMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString("th-TH", { year: "numeric", month: "long" });
}

export default async function CommissionPrintPage({
    params,
}: {
    params: Promise<{ month: string; staffKey: string }>;
}) {
    const { month, staffKey } = await params;
    // staffKey = "staff_id-role"
    const dashIdx = staffKey.lastIndexOf("-");
    const staffId = staffKey.substring(0, dashIdx);
    const role = staffKey.substring(dashIdx + 1);

    const { entries, total, staff_name } = await getCommissionDetail(staffId, role, month);

    const supabase = await createClient();
    const { data: clinic } = await supabase
        .from("tenants")
        .select("clinic_name, clinic_name_en, address_detail, phone, license_number")
        .limit(1).maybeSingle();

    // Check if paid
    const { data: payout } = await supabase
        .from("commission_payouts")
        .select("amount, paid_at, payment_method, note, profiles!commission_payouts_paid_by_fkey(full_name)")
        .eq("staff_id", staffId)
        .eq("period_month", month)
        .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payoutTyped = payout as any;
    const paidByName = Array.isArray(payoutTyped?.profiles) ? payoutTyped.profiles[0]?.full_name : payoutTyped?.profiles?.full_name;

    // Group by date
    const byDate: Record<string, typeof entries> = {};
    entries.forEach(e => {
        if (!byDate[e.invoice_date]) byDate[e.invoice_date] = [];
        byDate[e.invoice_date].push(e);
    });

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
                                    <div className="text-[13px] font-semibold text-slate-800 mt-0.5">
                                        {clinic.clinic_name_en}
                                    </div>
                                )}
                                {clinic?.address_detail && (
                                    <div className="text-[12px] text-slate-700 mt-1 leading-relaxed">
                                        {clinic.address_detail}
                                    </div>
                                )}
                                {clinic?.phone && (
                                    <div className="text-[12px] text-slate-700">โทรศัพท์ {clinic.phone}</div>
                                )}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold text-slate-600">
                                Commission Report
                            </div>
                            <h1 className="text-[22px] font-black tracking-tight text-black leading-tight mt-1">
                                รายงานค่า DF / Commission
                            </h1>
                            <div className="text-[13px] italic text-slate-700">{formatMonth(month)}</div>
                        </div>
                    </div>
                </div>

                {/* Staff Info */}
                <div className="grid grid-cols-2 gap-6 py-3" style={{ borderBottom: "1px solid #000" }}>
                    <div className="space-y-1 text-[13px]">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">พนักงาน · Staff</div>
                        <div className="text-[16px] font-bold">{staff_name}</div>
                        <div className="text-[12px] text-slate-600">
                            ตำแหน่ง: <span className="font-semibold">{ROLE_LABEL[role] || role}</span>
                        </div>
                    </div>
                    <div className="space-y-1 text-[13px] text-right">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">งวด · Period</div>
                        <div className="text-[16px] font-bold">{formatMonth(month)}</div>
                        <div className="text-[12px] text-slate-600">
                            จำนวนรายการ: <span className="font-bold tabular-nums">{entries.length}</span>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="mt-4">
                    <h2 className="text-[14px] font-black tracking-wider mb-2">รายละเอียดการคำนวณ</h2>
                    {entries.length === 0 ? (
                        <p className="text-center text-slate-400 italic py-6">ไม่มีรายการ commission ในเดือนนี้</p>
                    ) : (
                        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "2px solid #000" }}>
                                    <th className="text-left py-1.5 px-2 font-bold">วันที่</th>
                                    <th className="text-left py-1.5 px-2 font-bold">เลขใบเสร็จ</th>
                                    <th className="text-left py-1.5 px-2 font-bold">รายการ</th>
                                    <th className="text-center py-1.5 px-2 font-bold">จำนวน</th>
                                    <th className="text-right py-1.5 px-2 font-bold">DF/หน่วย</th>
                                    <th className="text-right py-1.5 px-2 font-bold">รวม</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(byDate).map(([date, dateEntries], idx) => (
                                    <>
                                        {dateEntries.map((e, i) => (
                                            <tr key={`${date}-${i}`} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                                <td className="py-1.5 px-2 tabular-nums">
                                                    {i === 0 ? new Date(date).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : ""}
                                                </td>
                                                <td className="py-1.5 px-2 font-mono text-[11px]">{e.inv_id}</td>
                                                <td className="py-1.5 px-2">{e.item_name}</td>
                                                <td className="py-1.5 px-2 text-center tabular-nums">{e.qty}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">
                                                    ฿{Number(e.df_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-bold tabular-nums">
                                                    ฿{Number(e.commission_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: "2px solid #000" }}>
                                    <td colSpan={5} className="py-2 px-2 text-right font-bold uppercase tracking-wider">
                                        ยอดรวม Commission
                                    </td>
                                    <td className="py-2 px-2 text-right font-black text-[15px] tabular-nums">
                                        ฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>

                {/* Payout info */}
                {payoutTyped && (
                    <div className="mt-4 p-3 rounded border-2 border-emerald-300 bg-emerald-50">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-1">บันทึกการจ่าย</div>
                        <div className="flex justify-between text-[13px]">
                            <span>ยอดจ่ายจริง</span>
                            <span className="font-bold tabular-nums">฿{Number(payoutTyped.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-[12px] text-slate-700 mt-1">
                            <span>วันที่จ่าย</span>
                            <span>{new Date(payoutTyped.paid_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                        </div>
                        <div className="flex justify-between text-[12px] text-slate-700">
                            <span>วิธีจ่าย</span>
                            <span className="font-semibold">{payoutTyped.payment_method === "cash" ? "เงินสด" : payoutTyped.payment_method === "transfer" ? "โอน" : "รวมในเงินเดือน"}</span>
                        </div>
                        {paidByName && (
                            <div className="flex justify-between text-[12px] text-slate-700">
                                <span>ผู้จ่าย</span>
                                <span>{paidByName}</span>
                            </div>
                        )}
                        {payoutTyped.note && (
                            <div className="text-[12px] text-slate-700 mt-1">หมายเหตุ: {payoutTyped.note}</div>
                        )}
                    </div>
                )}

                {/* Signatures */}
                <div className="mt-10 grid grid-cols-2 gap-16 text-[12px]">
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="font-semibold">({staff_name})</div>
                        <div className="text-[10px] italic text-slate-600">ผู้รับเงิน</div>
                    </div>
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-8 mb-1" />
                        <div className="font-semibold">{paidByName ? `(${paidByName})` : "(........................................)"}</div>
                        <div className="text-[10px] italic text-slate-600">ผู้จ่ายเงิน / ผู้จัดการ</div>
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
