// ใบ Laboratory Report กลาง — ใช้ร่วม 3 ที่: คลินิกนิรนาม, ห้องตรวจแพทย์, PDF ฝั่งคนไข้ (/result)
// แต่ละที่คำนวณ props แล้วส่งเข้า → แก้ที่นี่ที่เดียว มีผลทุกใบ
import { ClinicMasthead } from "@/app/print/clinic-masthead";

export function dmyShort(d: string | null | undefined): string {
    if (!d) return "—";
    const [y, m, dd] = String(d).slice(0, 10).split("-");
    return `${dd}/${m}/${(y || "").slice(2)}`;
}
export function dtBkk(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
    const z = (n: number) => String(n).padStart(2, "0");
    return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
}

export interface LabRow { name: string; isExternal: boolean; main: string; mainAbn: boolean; suffix?: string; note?: string | null; }
export interface SignData { name: string | null; license: string | null; at: string | null; }

export function LabReportSheet(props: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clinic: any; titleSuffix?: string; notLast?: boolean;
    patientName: string; hn: string; sex: string; age: string; clinicName: string;
    labNo: string; sampleType: string; requestedDate: string; collectedAt: string; receivedAt: string;
    rows: LabRow[]; commentText: string; apptText?: string | null; footerNote: string;
    reported: SignData; approved: SignData; physician?: { name: string | null; license: string | null } | null;
    images?: string[];
}) {
    const {
        clinic, titleSuffix = "", notLast = false,
        patientName, hn, sex, age, clinicName, labNo, sampleType, requestedDate, collectedAt, receivedAt,
        rows, commentText, apptText, footerNote, reported, approved, physician, images,
    } = props;
    return (
        <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", pageBreakAfter: notLast ? "always" : "auto" }}>
            <ClinicMasthead clinic={clinic} />
            <div className="flex justify-end items-center gap-2.5 mt-1.5">
                <div className="text-[9px] text-slate-600 text-right leading-tight">
                    <div>Tested at an ISO 15189</div>
                    <div className="font-semibold text-slate-700">accredited laboratory</div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/accredit-ilac.png" alt="ilac-MRA" style={{ height: "34px", width: "auto", filter: "grayscale(100%)" }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/accredit-dmsc.png" alt="DMSc QA" style={{ height: "34px", width: "auto", filter: "grayscale(100%)" }} />
            </div>
            <div className="text-center mt-3" style={{ fontSize: "18px", fontWeight: 900 }}>
                Laboratory Report{titleSuffix ? <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}> · {titleSuffix}</span> : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]" style={{ borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1", padding: "10px 2px" }}>
                <RptField label="Patient Name" value={patientName} />
                <RptField label="HN / PID" value={hn} mono={hn !== "—"} />
                <RptField label="Sex" value={sex} />
                <RptField label="Age" value={age} />
                <RptField label="Clinic / Hosp" value={clinicName} />
                <RptField label="LAB No." value={labNo} mono />
                <RptField label="Sample Type" value={sampleType} />
                <RptField label="Requested Date" value={requestedDate} />
                <RptField label="Collected Date/Time" value={collectedAt} />
                <RptField label="Received Date/Time" value={receivedAt} />
            </div>

            <div className="mt-4">
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #0891b2", background: "#ecfeff" }} className="text-left">
                            <th className="py-2 px-2 font-black" style={{ width: "55%" }}>Lab Test <span className="text-[10px] font-semibold text-slate-500">รายการตรวจ</span></th>
                            <th className="py-2 px-2 font-black">Result <span className="text-[10px] font-semibold text-slate-500">ผล</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 ? "#f8fafc" : "#fff" }}>
                                <td className="py-2 px-2 font-semibold align-top">{r.isExternal ? "*" : ""}{r.name}</td>
                                <td className="py-2 px-2 align-top">
                                    <span style={{ fontWeight: 700, color: r.mainAbn ? "#be123c" : "#0f172a" }}>{r.main}</span>
                                    {r.suffix ? <span className="text-[10px] font-bold" style={{ color: r.mainAbn ? "#be123c" : "#64748b" }}> · {r.suffix}</span> : null}
                                    {r.note ? <div className="text-slate-500 text-[10.5px] mt-0.5">{r.note}</div> : null}
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={2} className="py-3 px-2 text-slate-400 italic">ยังไม่มีรายการตรวจ Lab</td></tr>}
                    </tbody>
                </table>

                <p className="mt-2 text-[10.5px] text-slate-600">(*) เทสที่มีเครื่องหมาย * ส่งตรวจที่ห้องปฏิบัติการที่ได้รับการรับรอง ISO 15189</p>

                {images && images.length > 0 ? (
                    <div className="mt-3">
                        <div className="text-[11px] font-bold text-slate-600 mb-1.5">ผลตรวจแนบ · Attached Result</div>
                        <div className="flex flex-col gap-2">
                            {images.map((src, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={src} alt={`result-${i + 1}`} style={{ maxWidth: "100%", height: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }} />
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="mt-3 text-[11.5px] flex gap-2">
                    <span className="font-bold shrink-0">Comment :</span>
                    <span className="flex-1" style={{ borderBottom: "1px dotted #94a3b8", minHeight: "16px" }}>{commentText}</span>
                </div>
                {apptText ? <p className="mt-2 text-[11.5px]">นัดฟังผล/ติดตาม: <b>{apptText}</b></p> : null}
                <p className="mt-3 text-[10.5px] text-slate-500 italic leading-relaxed">{footerNote}</p>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-16 text-[12px]">
                <SignBlock role="Reported By · ผู้รายงานผล" name={reported.name} license={reported.license} at={reported.at} />
                <SignBlock role="Approved By · ผู้ตรวจสอบ" name={approved.name} license={approved.license} at={approved.at} />
            </div>
            {physician ? (
                <div className="mt-9 flex justify-center text-[12px]">
                    <div style={{ width: "56%" }}>
                        <SignBlock role="แพทย์ผู้ตรวจ · Examining Physician" name={physician.name} license={physician.license} at={null} />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function RptField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <span className="text-slate-500 shrink-0">{label} :</span>
            <span className={`flex-1 font-semibold ${mono ? "font-mono" : ""}`} style={{ borderBottom: "1px dotted #cbd5e1" }}>{value}</span>
        </div>
    );
}

export function SignBlock({ role, name, license, at }: { role: string; name: string | null; license: string | null; at: string | null }) {
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
