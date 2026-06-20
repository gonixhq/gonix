"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, Plus, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function LabClient({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    labOrders,
    pending,
    inProgress,
    completed,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    labOrders: any[];
    pending: number;
    inProgress: number;
    completed: number;
}) {
    const { language } = useLanguage();

    const statusLabel: Record<string, string> = {
        pending: language === "en" ? "Pending" : "รอดำเนินการ",
        in_progress: language === "en" ? "In Progress" : "กำลังทำ",
        completed: language === "en" ? "Completed" : "เสร็จแล้ว",
        cancelled: language === "en" ? "Cancelled" : "ยกเลิก",
    };
    const statusColor: Record<string, string> = {
        pending: "bg-amber-100 text-amber-700 border-amber-200",
        in_progress: "bg-blue-100 text-blue-700 border-blue-200",
        completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
        cancelled: "bg-slate-100 text-slate-600 border-slate-200",
    };
    const statusIcon: Record<string, React.ReactNode> = {
        pending: <Clock className="h-3.5 w-3.5" />,
        in_progress: <AlertCircle className="h-3.5 w-3.5" />,
        completed: <CheckCircle2 className="h-3.5 w-3.5" />,
    };

    return (
        <div className="space-y-8 animate-fade-in relative z-10 font-sans pb-10">
            {/* Sub-header — compact */}
            <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-sm font-medium text-slate-500">
                    <span className="font-bold text-blue-700">
                        {language === "en" ? "Laboratory Results" : "ผลการตรวจทางห้องปฏิบัติการ"}
                    </span>
                </p>
                <Link href="/dashboard/lab/new">
                    <Button className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                        <Plus className="h-4 w-4" />
                        {language === "en" ? "Order Lab" : "สั่ง Lab"}
                    </Button>
                </Link>
            </div>

            {/* Stats - Glassmorphism Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Pending */}
                <Card className="rounded-3xl border-0 overflow-hidden relative shadow-[0_8px_30px_rgb(0,0,0,0.06)] group">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/50 backdrop-blur-xl z-0" />
                    <div className="absolute right-0 top-0 -mr-6 -mt-6 w-32 h-32 bg-amber-100/50 rounded-full blur-2xl z-0 group-hover:bg-amber-200/50 transition-colors" />
                    <CardContent className="p-6 relative z-10 h-full flex flex-col justify-center">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[13px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === "en" ? "Pending" : "รอดำเนินการ"}</p>
                                <p className="text-3xl font-black text-amber-600">{pending}</p>
                            </div>
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-100 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                                <Clock className="h-7 w-7 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* In Progress */}
                <Card className="rounded-3xl border-0 overflow-hidden relative shadow-[0_8px_30px_rgb(0,0,0,0.06)] group">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/50 backdrop-blur-xl z-0" />
                    <div className="absolute right-0 top-0 -mr-6 -mt-6 w-32 h-32 bg-blue-100/50 rounded-full blur-2xl z-0 group-hover:bg-blue-200/50 transition-colors" />
                    <CardContent className="p-6 relative z-10 h-full flex flex-col justify-center">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[13px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === "en" ? "In Progress" : "กำลังดำเนินการ"}</p>
                                <p className="text-3xl font-black text-blue-600">{inProgress}</p>
                            </div>
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-100 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                                <AlertCircle className="h-7 w-7 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Completed */}
                <Card className="rounded-3xl border-0 overflow-hidden relative shadow-[0_8px_30px_rgb(0,0,0,0.06)] group">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/50 backdrop-blur-xl z-0" />
                    <div className="absolute right-0 top-0 -mr-6 -mt-6 w-32 h-32 bg-emerald-100/50 rounded-full blur-2xl z-0 group-hover:bg-emerald-200/50 transition-colors" />
                    <CardContent className="p-6 relative z-10 h-full flex flex-col justify-center">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[13px] font-black uppercase tracking-widest text-slate-400 mb-1">{language === "en" ? "Completed" : "เสร็จสิ้น"}</p>
                                <p className="text-3xl font-black text-emerald-600">{completed}</p>
                            </div>
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 border border-emerald-100 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Lab Orders List - Glassmorphism Table */}
            <div className="backdrop-blur-xl bg-white/60 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-200/50 bg-white/40">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                        <FlaskConical className="h-5 w-5 text-indigo-600" />
                        {language === "en" ? "Lab Orders List" : "รายการ Lab Orders"}
                    </h2>
                </div>

                <div className="p-0">
                    {!labOrders || labOrders.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center space-y-4">
                            <div className="h-20 w-20 rounded-full bg-slate-100 flex items-center justify-center">
                                <FlaskConical className="h-10 w-10 text-slate-300" />
                            </div>
                            <div className="text-center">
                                <p className="text-slate-500 font-bold mb-1">{language === "en" ? "No Lab Orders Yet" : "ยังไม่มีรายการ Lab"}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200/60 bg-slate-50/50">
                                        <th className="text-left px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{language === "en" ? "Patient" : "ผู้ป่วย"}</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">VN</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{language === "en" ? "Date" : "วันที่สั่ง"}</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{language === "en" ? "Notes" : "หมายเหตุ"}</th>
                                        <th className="text-center px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{language === "en" ? "Status" : "สถานะ"}</th>
                                        <th className="text-right px-6 py-4"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {labOrders.map((lab) => {
                                        const pt = Array.isArray(lab.patients) ? lab.patients[0] : lab.patients;
                                        const visit = Array.isArray(lab.visits) ? lab.visits[0] : lab.visits;
                                        return (
                                            <tr key={lab.id} className="border-b border-slate-100 last:border-0 hover:bg-white/80 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-800">{pt?.first_name} {pt?.last_name}</div>
                                                    <div className="text-xs text-slate-400 font-medium mt-0.5">HN: {pt?.hn}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                                                        {visit?.vn || "—"}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600 font-medium">
                                                    {new Date(lab.order_date).toLocaleDateString(language === "en" ? "en-US" : "th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 text-sm max-w-[200px] truncate">{lab.note || "—"}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold tracking-wide border shadow-sm",
                                                        statusColor[lab.status] || "bg-slate-100 text-slate-600 border-slate-200"
                                                    )}>
                                                        {statusIcon[lab.status]}
                                                        {statusLabel[lab.status] || lab.status}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Link href={`/dashboard/lab/${lab.id}`}>
                                                        <Button variant="outline" size="sm" className="rounded-xl text-xs font-bold shadow-sm hover:shadow-md hover:border-indigo-300 hover:text-indigo-700 transition-all bg-white">
                                                            {language === "en" ? "View" : "ดูผล"}
                                                        </Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
