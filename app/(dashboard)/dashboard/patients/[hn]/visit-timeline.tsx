import Link from "next/link";
import { GitCommitHorizontal } from "lucide-react";

interface TLVisit {
    vn: string;
    visit_date: string;
    status: string;
    chief_complaint?: string | null;
    icd10_primary?: string | null;
}

const STATUS_DOT: Record<string, string> = {
    completed: "bg-emerald-500",
    cancelled: "bg-slate-300",
    waiting: "bg-amber-400",
    triaged: "bg-blue-400",
    with_doctor: "bg-indigo-500",
    waiting_payment: "bg-orange-400",
    waiting_medicine: "bg-purple-400",
};

/** Visit Timeline — มุมมองแนวนอนสรุปทุก visit (เก่า→ใหม่) คลิกเปิดดูได้ */
export function VisitTimeline({ visits, icdMap }: { visits: TLVisit[]; icdMap: Record<string, string> }) {
    if (visits.length < 2) return null;

    // เรียงเก่า→ใหม่
    const sorted = [...visits].sort((a, b) => (a.visit_date < b.visit_date ? -1 : 1));

    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center gap-2 mb-4">
                <GitCommitHorizontal className="h-4 w-4 text-[#2B54F0]" />
                <h3 className="text-sm font-bold text-slate-800">ไทม์ไลน์การมาคลินิก</h3>
                <span className="text-xs text-slate-400">({sorted.length} ครั้ง · เก่า→ใหม่)</span>
            </div>
            <div className="overflow-x-auto pb-2">
                <div className="relative flex gap-4 min-w-min pt-1">
                    {/* เส้นแกน */}
                    <div className="absolute left-0 right-0 top-[7px] h-0.5 bg-slate-200" />
                    {sorted.map((v) => (
                        <Link
                            key={v.vn}
                            href={`/dashboard/visits/${v.vn}`}
                            className="relative shrink-0 w-40 group"
                        >
                            <div className={`h-3.5 w-3.5 rounded-full ring-2 ring-white shadow ${STATUS_DOT[v.status] || "bg-slate-400"} relative z-10`} />
                            <div className="mt-2 rounded-xl border border-slate-200/70 bg-white/70 p-2.5 group-hover:border-[#2B54F0]/40 group-hover:shadow-md transition-all">
                                <div className="text-xs font-bold text-slate-700">
                                    {new Date(v.visit_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                                </div>
                                {v.chief_complaint && (
                                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{v.chief_complaint}</div>
                                )}
                                {v.icd10_primary && (
                                    <div className="text-[10px] mt-1 inline-flex items-center gap-1">
                                        <span className="font-mono font-bold text-blue-700">{v.icd10_primary}</span>
                                        {icdMap[v.icd10_primary] && <span className="text-slate-400 truncate max-w-[90px]">{icdMap[v.icd10_primary]}</span>}
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
