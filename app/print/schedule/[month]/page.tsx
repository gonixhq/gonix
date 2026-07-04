import { createClient } from "@/lib/supabase/server";
import { getShiftsForMonth } from "@/lib/actions/doctor-shifts";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของ", admin: "แอดมิน", doctor: "แพทย์", dentist: "ทันตแพทย์",
    nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "กายภาพ", receptionist: "ต้อนรับ",
    accountant: "บัญชี", assistant: "ผู้ช่วย", staff: "พนักงาน",
};
const roleLabel = (r: string) => ROLE_LABEL[r] || r || "พนักงาน";
const THAI_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const hoursOf = (s: string, e: string) => Math.round(((toMin(e) - toMin(s)) / 60) * 10) / 10;
function monthLabel(month: string) { const [y, m] = month.split("-").map(Number); return `${THAI_MONTHS[m - 1]} ${y + 543}`; }

export default async function SchedulePrintPage({ params }: { params: Promise<{ month: string }> }) {
    const { month } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    let clinic: { clinic_name?: string; clinic_name_en?: string; address_detail?: string; phone?: string } | null = null;
    if (user) {
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
        if (profile?.clinic_id) {
            const { data: t } = await supabase.from("tenants").select("clinic_name, clinic_name_en, address_detail, phone").eq("id", profile.clinic_id).maybeSingle();
            clinic = t;
        }
    }

    const shifts = await getShiftsForMonth(month);

    // จัดกลุ่มตามวัน
    const byDate: Record<string, typeof shifts> = {};
    shifts.forEach((s) => { (byDate[s.shift_date] ||= []).push(s); });
    const dates = Object.keys(byDate).sort();

    // สรุปต่อคน
    const perStaff = new Map<string, { name: string; role: string; count: number; hours: number }>();
    shifts.forEach((s) => {
        let e = perStaff.get(s.doctor_staff_id);
        if (!e) { e = { name: s.doctor_name, role: s.role, count: 0, hours: 0 }; perStaff.set(s.doctor_staff_id, e); }
        e.count++; e.hours += hoursOf(s.start_time, s.end_time);
    });
    const summary = [...perStaff.values()].sort((a, b) => b.hours - a.hours);

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>

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
                            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold text-slate-600">Staff Schedule</div>
                            <h1 className="text-[22px] font-black tracking-tight text-black leading-tight mt-1">ตารางเวรการทำงาน</h1>
                            <div className="text-[13px] italic text-slate-700">{monthLabel(month)}</div>
                        </div>
                    </div>
                </div>

                {/* ตารางเวรรายวัน */}
                <div className="mt-4">
                    {dates.length === 0 ? (
                        <div className="py-10 text-center text-slate-500 text-[13px]">ยังไม่มีเวรในเดือนนี้</div>
                    ) : (
                        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "2px solid #000" }}>
                                    <th className="text-left py-1.5 px-2 font-bold" style={{ width: "22%" }}>วันที่</th>
                                    <th className="text-left py-1.5 px-2 font-bold">เวร</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dates.map((d) => {
                                    const dt = new Date(d + "T00:00:00");
                                    const rows = byDate[d].slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
                                    return (
                                        <tr key={d} style={{ borderBottom: "1px solid #cbd5e1", verticalAlign: "top" }}>
                                            <td className="py-2 px-2">
                                                <div className="font-bold tabular-nums">{dt.getDate()} {THAI_MONTHS[dt.getMonth()].slice(0, 3)}</div>
                                                <div className="text-[10px] text-slate-500">{THAI_FULL[dt.getDay()]}</div>
                                            </td>
                                            <td className="py-2 px-2">
                                                <div className="flex flex-col gap-0.5">
                                                    {rows.map((s) => (
                                                        <div key={s.id} className="flex items-center gap-2">
                                                            <span className="font-mono text-slate-600 tabular-nums" style={{ minWidth: "88px" }}>{s.start_time}–{s.end_time}</span>
                                                            <span className="font-semibold">{s.doctor_name}</span>
                                                            <span className="text-[10px] text-slate-500">· {roleLabel(s.role)}</span>
                                                            {s.room_name && <span className="text-[10px] text-slate-500">· {s.room_name}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* สรุปต่อคน */}
                {summary.length > 0 && (
                    <div className="mt-5">
                        <h2 className="text-[14px] font-black tracking-wider mb-2">สรุปเวรรายเดือน</h2>
                        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid #000" }}>
                                    <th className="text-left py-1 px-2 font-bold">พนักงาน</th>
                                    <th className="text-left py-1 px-2 font-bold">ตำแหน่ง</th>
                                    <th className="text-right py-1 px-2 font-bold">จำนวนเวร</th>
                                    <th className="text-right py-1 px-2 font-bold">รวมชั่วโมง</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.map((s, i) => (
                                    <tr key={i} style={{ borderBottom: "1px dotted #cbd5e1" }}>
                                        <td className="py-1.5 px-2 font-semibold">{s.name}</td>
                                        <td className="py-1.5 px-2 text-slate-600">{roleLabel(s.role)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums">{s.count}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-bold">{s.hours}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-8 text-[10px] text-slate-500 text-center italic">
                    สร้างจากระบบ Gonix — พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
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
