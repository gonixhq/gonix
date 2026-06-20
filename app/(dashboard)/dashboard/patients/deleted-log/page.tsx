import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, User, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DeletedLogPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Check owner role
    const { data: me } = await supabase
        .from("profiles")
        .select("role, clinic_id")
        .eq("id", user.id)
        .single();
    if (!me || me.role !== "owner") redirect("/dashboard/patients");

    // Fetch deletion log (RLS auto-filters by clinic)
    const { data: logs } = await supabase
        .from("deleted_hn_log")
        .select(`
            hn, original_patient_name, deleted_at, deleted_by,
            deleter:profiles!deleted_hn_log_deleted_by_fkey(full_name, role)
        `)
        .order("deleted_at", { ascending: false })
        .limit(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = (logs || []) as any[];

    function formatDateTime(ts: string) {
        return new Date(ts).toLocaleString("th-TH", {
            year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    }

    function timeAgo(ts: string): string {
        const diff = Date.now() - new Date(ts).getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return "เมื่อกี้";
        if (min < 60) return `${min} นาทีที่แล้ว`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr} ชม.ที่แล้ว`;
        const day = Math.floor(hr / 24);
        if (day < 30) return `${day} วันที่แล้ว`;
        const mon = Math.floor(day / 30);
        if (mon < 12) return `${mon} เดือนที่แล้ว`;
        return `${Math.floor(mon / 12)} ปีที่แล้ว`;
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
            {/* Back link */}
            <Link href="/dashboard/patients"
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                <ArrowLeft className="h-4 w-4" /> กลับไปทะเบียนผู้ป่วย
            </Link>

            {/* Sub-header — compact */}
            <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-sm font-medium text-slate-500">
                    <span className="font-bold text-red-700">บันทึก HN ที่ถูกลบทั้งหมด</span>
                    <span className="text-slate-300 mx-2">·</span>
                    <span><span className="font-bold text-slate-700 tabular-nums">{entries.length}</span> รายการ</span>
                </p>
                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
                    Owner Only
                </span>
            </div>

            {/* Info note */}
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
                <div className="text-amber-600 shrink-0 mt-0.5">💡</div>
                <div className="text-xs text-amber-900 leading-relaxed">
                    <strong>หมายเหตุ:</strong> HN ที่อยู่ในตารางนี้จะ "ถูกล็อก" — ระบบจะไม่นำเลขเหล่านี้กลับมาใช้ซ้ำ
                    เมื่อสร้างผู้ป่วยใหม่ จะข้ามไปใช้เลขถัดไปอัตโนมัติ
                </div>
            </div>

            {/* Table */}
            <div className="gonix-card-premium overflow-hidden">
                {entries.length === 0 ? (
                    <div className="text-center py-16">
                        <Trash2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">ยังไม่มีประวัติการลบผู้ป่วย</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50/60 border-b border-slate-200/60 text-left">
                                <th className="font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider">HN ที่ถูกลบ</th>
                                <th className="font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider">ชื่อผู้ป่วย</th>
                                <th className="font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider">ผู้ลบ</th>
                                <th className="font-bold text-slate-500 px-5 py-3 uppercase text-[10px] tracking-wider">วันที่ลบ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e) => {
                                const deleter = Array.isArray(e.deleter) ? e.deleter[0] : e.deleter;
                                return (
                                    <tr key={e.hn} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3">
                                            <span className="font-mono text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                                {e.hn}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <User className="h-3.5 w-3.5 text-slate-400" />
                                                {e.original_patient_name || "—"}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            {deleter ? (
                                                <div>
                                                    <div className="text-slate-800 font-medium">{deleter.full_name}</div>
                                                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                                                        {deleter.role === "owner" ? "เจ้าของคลินิก" : deleter.role}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Clock className="h-3 w-3 text-slate-400" />
                                                <span className="text-xs">{formatDateTime(e.deleted_at)}</span>
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-0.5 ml-4">{timeAgo(e.deleted_at)}</div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
