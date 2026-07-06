import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClipboardList, ChevronRight } from "lucide-react";
import { bangkokDate } from "@/lib/utils/date";
import ScreeningRow from "./screening-row";

export const dynamic = "force-dynamic";

export default async function ScreeningQueuePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const today = bangkokDate();

    // Fetch all visits waiting for screening today
    // Status 'waiting' or 'triaged' (not yet 'with_doctor')
    const { data: visits } = await supabase
        .from("visits")
        .select(`
            vn, hn, visit_time, status, service_category, chief_complaint, triage_level, created_at,
            patients!inner(prefix, first_name, last_name, gender, dob, blood_group, allergy_summary, disease_summary, phone)
        `)
        .eq("visit_date", today)
        .in("status", ["waiting", "triaged"])
        .order("created_at", { ascending: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (visits || []) as any[];

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in">
            {/* Sub-header — compact (Top Navbar shows page title) */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <ClipboardList className="h-4 w-4" />
                        วัด Vital Signs + คัดกรอง
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>รอซักประวัติ <span className="font-bold text-slate-700 tabular-nums">{items.length}</span> ราย</span>
                </p>
                <Link href="/dashboard/visits/new">
                    <Button className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                        <ChevronRight className="h-3.5 w-3.5 rotate-180" /> สร้าง Visit ใหม่
                    </Button>
                </Link>
            </div>

            {/* Queue list */}
            {items.length === 0 ? (
                <div className="rounded-3xl bg-gradient-to-br from-white/70 via-white/60 to-blue-50/40 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-blue-100/60 flex items-center justify-center mx-auto mb-3">
                        <ClipboardList className="h-8 w-8 text-blue-600" />
                    </div>
                    <p className="text-base font-bold text-slate-700">ไม่มีผู้ป่วยรอซักประวัติ</p>
                    <p className="text-xs text-slate-500 mt-1">รอเคาท์เตอร์สร้าง Visit ใหม่...</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((v, i) => (
                        <ScreeningRow key={v.vn} visit={v} queueNumber={i + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}
