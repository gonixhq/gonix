import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
    Users, Calendar, TrendingUp, Stethoscope,
    LayoutDashboard, Clock, CalendarDays, ArrowRight,
    Pill, UserCog, ClipboardList, CalendarClock, Wallet,
} from "lucide-react";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { getAlerts } from "@/lib/actions/alerts";
import { getOnDutyDoctors, getDoctorsNotCheckedIn } from "@/lib/actions/doctor-shifts";
import { bangkokDate } from "@/lib/utils/date";
import { getAnonRevenue } from "@/lib/actions/anonymous";

const STATUS_LABEL: Record<string, string> = {
    waiting: "รอซักประวัติ",
    triaged: "คัดกรองแล้ว",
    with_doctor: "พบแพทย์",
    with_nurse: "พยาบาล",
    waiting_medicine: "รอรับยา",
    waiting_payment: "รอชำระ",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิก",
};

const STATUS_COLOR: Record<string, string> = {
    waiting: "bg-amber-100 text-amber-700",
    triaged: "bg-blue-100 text-blue-700",
    with_doctor: "bg-indigo-100 text-indigo-700",
    with_nurse: "bg-cyan-100 text-cyan-700",
    waiting_medicine: "bg-purple-100 text-purple-700",
    waiting_payment: "bg-orange-100 text-orange-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-slate-100 text-slate-500",
};

export default async function DashboardPage() {
    const supabase = await createClient();
    const { permissions } = await getEffectivePermissionsForUser();

    const today = bangkokDate();
    const monthStart = today.slice(0, 7) + "-01";

    // Parallel fetch
    const [
        patientsRes,
        visitsRes,
        invoicesMonthRes,
        staffRes,
        todayQueueRes,
        todayAppointmentsRes,
        pendingStaffRes,
        lowStockRes,
    ] = await Promise.all([
        // 1) Active patients count
        supabase.from("patients").select("hn", { count: "exact", head: true }).eq("is_active", true),
        // 2) Today's visits count
        supabase.from("visits").select("vn", { count: "exact", head: true }).eq("visit_date", today),
        // 3) Monthly revenue (รวม total_amount เดือนนี้ — ตัดใบที่ยกเลิก/คืนเงิน, อิง invoice_date)
        supabase.from("invoice_headers").select("total_amount, status").gte("invoice_date", monthStart).lte("invoice_date", today),
        // 4) Active staff count
        supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("approval_status", "approved").eq("is_active", true),
        // 5) Today's queue (top 6 active)
        supabase.from("visits")
            .select("vn, visit_time, status, chief_complaint, hn, patients!inner(first_name, last_name)")
            .eq("visit_date", today)
            .neq("status", "completed")
            .neq("status", "cancelled")
            .order("created_at", { ascending: true })
            .limit(6),
        // 7) Today's appointments (top 6)
        supabase.from("appointments")
            .select("id, appt_start, status, hn, patients!inner(first_name, last_name)")
            .eq("appt_date", today)
            .neq("status", "cancelled")
            .order("appt_start", { ascending: true })
            .limit(6),
        // 8) Pending staff count
        supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("approval_status", "pending"),
        // 9) Low stock items
        supabase.from("inventory").select("id, item_name, stock_qty, min_stock, unit", { count: "exact" })
            .eq("is_active", true)
            .gt("min_stock", 0)
            .limit(50),
    ]);

    const anonMonthRev = await getAnonRevenue(monthStart, today); // + รายรับคลินิกนิรนาม
    const monthlyRevenue = (invoicesMonthRes.data || [])
        .filter((inv: { status: string | null }) => inv.status !== "voided" && inv.status !== "refunded")
        .reduce((sum: number, inv: { total_amount: number | null }) => sum + (inv.total_amount || 0), 0)
        + anonMonthRev.total;

    // Low stock = items where stock_qty <= min_stock
    const lowStock = (lowStockRes.data || []).filter(
        (i: { stock_qty: number | null; min_stock: number | null }) =>
            (i.stock_qty ?? 0) <= (i.min_stock ?? 0)
    );

    const showFinance = permissions["finance.view"] === true;
    const showStaff = permissions["staff.manage"] === true;
    const showInventory = permissions["inventory.view"] === true;

    // Unified alerts (expiry + outstanding) — สต๊อกต่ำใช้ของเดิม (lowStock) อยู่แล้ว
    const alerts = await getAlerts();

    // หมอเข้าเวรวันนี้ + ใครเข้าเวรอยู่แต่ยังไม่ check-in ห้อง
    const [onDuty, notCheckedIn] = await Promise.all([getOnDutyDoctors(today), getDoctorsNotCheckedIn()]);

    // ── Hero: ทักทายตามเวลา + ชื่อผู้ใช้ + วันที่ (เวลาไทย) ──
    const { data: { user } } = await supabase.auth.getUser();
    let displayName = "ยินดีต้อนรับ";
    if (user) {
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        displayName = prof?.full_name || user.email || displayName;
    }
    const bkkHour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }));
    const greeting = bkkHour < 12 ? "สวัสดีตอนเช้า" : bkkHour < 17 ? "สวัสดีตอนบ่าย" : bkkHour < 20 ? "สวัสดีตอนเย็น" : "สวัสดีตอนค่ำ";
    const fullDate = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const statCards = [
        { label: "ผู้ป่วยทั้งหมด", value: patientsRes.count?.toLocaleString() || "0", sub: "Active records", icon: Users, tile: "bg-[#2B54F0]/10", iconColor: "text-[#2B54F0]", glow: "from-[#2B54F0]/20 to-[#5F85FF]/5" },
        { label: "คิววันนี้", value: visitsRes.count?.toLocaleString() || "0", sub: today, icon: Calendar, tile: "bg-[#0EA5A0]/10", iconColor: "text-[#0EA5A0]", glow: "from-[#00FFCC]/25 to-[#0EA5A0]/5" },
        ...(showFinance ? [{ label: "รายได้เดือนนี้", value: `฿${monthlyRevenue.toLocaleString()}`, sub: "This month", icon: TrendingUp, tile: "bg-[#10B981]/10", iconColor: "text-[#10B981]", glow: "from-[#15FF83]/25 to-[#10B981]/5" }] : []),
        { label: "พนักงาน", value: staffRes.count?.toString() || "0", sub: "Active staff", icon: Stethoscope, tile: "bg-[#6366F1]/10", iconColor: "text-[#6366F1]", glow: "from-[#6366F1]/20 to-[#8B5CF6]/5" },
    ];

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
            {/* ════════ Hero banner — branded, ties to login orb ════════ */}
            <div
                className="relative overflow-hidden rounded-3xl p-6 sm:p-8"
                style={{
                    background: "rgba(255,255,255,0.55)",
                    backdropFilter: "blur(20px) saturate(150%)",
                    WebkitBackdropFilter: "blur(20px) saturate(150%)",
                    border: "1px solid rgba(255,255,255,0.7)",
                    boxShadow: "0 12px 36px -18px rgba(43,84,240,0.22)",
                }}
            >
                {/* mesh blobs — subtle */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: [
                            "radial-gradient(at 88% 6%, rgba(0,255,204,0.16) 0px, transparent 45%)",
                            "radial-gradient(at 6% 95%, rgba(95,133,255,0.18) 0px, transparent 45%)",
                        ].join(", "),
                    }}
                />
                {/* grain */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.10] mix-blend-overlay"
                    style={{
                        backgroundImage:
                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                    }}
                />
                {/* decorative orb echo — soft */}
                <div
                    className="absolute -right-10 -top-16 h-52 w-52 rounded-full blur-2xl pointer-events-none"
                    style={{ background: "radial-gradient(circle, rgba(0,255,204,0.20) 0%, transparent 70%)" }}
                />

                <div className="relative z-10">
                    <p className="text-sm font-semibold" style={{ color: "#2B54F0" }}>{greeting}</p>
                    <h1 className="text-2xl sm:text-[32px] font-black text-slate-800 tracking-tight mt-1 leading-tight truncate">
                        {displayName}
                    </h1>
                    <p className="text-slate-500 text-sm mt-2 inline-flex items-center gap-2" suppressHydrationWarning>
                        <CalendarDays className="h-4 w-4 text-[#2B54F0]" /> {fullDate}
                    </p>
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {statCards.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div key={i} className="gonix-card-premium p-5 relative overflow-hidden">
                            <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${s.glow} blur-2xl pointer-events-none`} />
                            <div className="relative">
                                <div className={`h-11 w-11 rounded-2xl flex items-center justify-center mb-3 ${s.tile}`}>
                                    <Icon className={`h-5 w-5 ${s.iconColor}`} />
                                </div>
                                <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{s.value}</h3>
                                <p className="text-sm font-semibold text-slate-600 mt-1">{s.label}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Row: On-duty + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {/* On-duty doctors today */}
                <div className="gonix-card-premium p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-[#2B54F0]" />
                        <h2 className="text-base font-bold text-slate-800">หมอเข้าเวรวันนี้</h2>
                        <span className="text-xs text-slate-400">({onDuty.length})</span>
                    </div>
                    {showStaff && (
                        <Link href="/dashboard/doctor-schedule" className="text-xs font-semibold text-[#2B54F0] hover:text-[#0026A1] inline-flex items-center gap-1">
                            จัดการเวร <ArrowRight className="h-3 w-3" />
                        </Link>
                    )}
                </div>
                {notCheckedIn.length > 0 && (
                    <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700">
                        ⚠️ เข้าเวรอยู่แต่ยังไม่ check-in ห้อง: {notCheckedIn.join(", ")}
                    </div>
                )}
                {onDuty.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2">ยังไม่ได้ลงเวรแพทย์สำหรับวันนี้</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {onDuty.map((d) => (
                            <div key={d.doctor_staff_id} className="inline-flex items-center gap-2 rounded-xl bg-[#2B54F0]/5 border border-[#2B54F0]/15 px-3 py-2">
                                <div className="h-7 w-7 rounded-lg bg-[#2B54F0]/10 flex items-center justify-center shrink-0">
                                    <Stethoscope className="h-3.5 w-3.5 text-[#2B54F0]" />
                                </div>
                                <div className="leading-tight">
                                    <div className="text-sm font-bold text-slate-800">{d.doctor_name}</div>
                                    <div className="text-[11px] font-mono text-slate-500">{d.earliest}–{d.latest}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </div>

                {/* Alerts panel */}
                <div className="gonix-card-premium p-6 flex flex-col">
                    <h2 className="text-base font-bold text-slate-800 mb-1">แจ้งเตือนสำคัญ</h2>
                    <p className="text-xs text-slate-500 mb-4">รายการที่ต้องดำเนินการ</p>

                    <div className="flex-1 space-y-3">
                        {/* Pending staff approvals */}
                        {showStaff && (pendingStaffRes.count || 0) > 0 && (
                            <Link href="/dashboard/staff" className="block group">
                                <div className="rounded-xl bg-amber-50/70 border border-amber-200/60 p-3 hover:bg-amber-100/60 transition-colors flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                                        <UserCog className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-amber-900">รออนุมัติพนักงาน</div>
                                        <div className="text-xs text-amber-700">{pendingStaffRes.count} คนรอการตรวจสอบ</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>
                        )}

                        {/* Low stock */}
                        {showInventory && lowStock.length > 0 && (
                            <Link href="/dashboard/inventory" className="block group">
                                <div className="rounded-xl bg-red-50/70 border border-red-200/60 p-3 hover:bg-red-100/60 transition-colors flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
                                        <Pill className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-red-900">สต๊อกต่ำกว่าเกณฑ์</div>
                                        <div className="text-xs text-red-700">{lowStock.length} รายการต้องเติมสต๊อก</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-red-500 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>
                        )}

                        {/* Expired drugs */}
                        {showInventory && alerts.expired > 0 && (
                            <Link href="/dashboard/inventory" className="block group">
                                <div className="rounded-xl bg-red-50/70 border border-red-200/60 p-3 hover:bg-red-100/60 transition-colors flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
                                        <CalendarClock className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-red-900">ยา/เวชภัณฑ์หมดอายุแล้ว</div>
                                        <div className="text-xs text-red-700">{alerts.expired} รายการ — ควรนำออกจากคลัง</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-red-500 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>
                        )}

                        {/* Near expiry */}
                        {showInventory && alerts.expiringSoon > 0 && (
                            <Link href="/dashboard/inventory" className="block group">
                                <div className="rounded-xl bg-orange-50/70 border border-orange-200/60 p-3 hover:bg-orange-100/60 transition-colors flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                                        <CalendarClock className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-orange-900">ใกล้หมดอายุ (≤90 วัน)</div>
                                        <div className="text-xs text-orange-700">{alerts.expiringSoon} รายการ — เร่งใช้/ระบาย</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-orange-500 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>
                        )}

                        {/* Outstanding payments */}
                        {showFinance && alerts.outstanding > 0 && (
                            <Link href="/dashboard/reports" className="block group">
                                <div className="rounded-xl bg-amber-50/70 border border-amber-200/60 p-3 hover:bg-amber-100/60 transition-colors flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                                        <Wallet className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-amber-900">ค้างชำระ</div>
                                        <div className="text-xs text-amber-700">{alerts.outstanding} ใบ · ฿{alerts.outstandingAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>
                        )}

                        {/* No alerts */}
                        {(!showStaff || (pendingStaffRes.count || 0) === 0)
                            && (!showInventory || lowStock.length === 0)
                            && (!showInventory || alerts.expired === 0)
                            && (!showInventory || alerts.expiringSoon === 0)
                            && (!showFinance || alerts.outstanding === 0) && (
                            <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/60 p-4 text-center">
                                <div className="text-sm font-bold text-emerald-800 mb-1">✓ ไม่มีรายการเร่งด่วน</div>
                                <div className="text-xs text-emerald-700">ระบบทำงานปกติ</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Row: Today's queue + appointments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Today's queue */}
                <div className="gonix-card-premium overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 bg-slate-50/40">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-slate-600" />
                            <h2 className="text-sm font-bold text-slate-800">คิววันนี้</h2>
                            <span className="text-xs text-slate-400">({(todayQueueRes.data || []).length} รายการ)</span>
                        </div>
                        <Link href="/dashboard/screening" className="text-xs font-semibold text-[#2B54F0] hover:text-[#0026A1] inline-flex items-center gap-1">
                            ซักประวัติ <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {(todayQueueRes.data || []).length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-400">ยังไม่มีคนไข้ในคิววันนี้</div>
                        ) : (
                            (todayQueueRes.data || []).map((v) => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const p = (v as any).patients;
                                const name = p ? `${p.first_name} ${p.last_name}` : "—";
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const status = (v as any).status as string;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const visitTime = (v as any).visit_time as string;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const chiefComplaint = (v as any).chief_complaint;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const vn = (v as any).vn as string;
                                return (
                                    <Link key={vn} href={`/dashboard/visits/${vn}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                                        <div className="text-xs font-mono text-slate-500 w-12">{visitTime?.slice(0, 5) || "—"}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 truncate">{name}</div>
                                            {chiefComplaint && <div className="text-xs text-slate-500 truncate">{chiefComplaint}</div>}
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}>
                                            {STATUS_LABEL[status] || status}
                                        </span>
                                    </Link>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Today's appointments */}
                <div className="gonix-card-premium overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 bg-slate-50/40">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-slate-600" />
                            <h2 className="text-sm font-bold text-slate-800">นัดหมายวันนี้</h2>
                            <span className="text-xs text-slate-400">({(todayAppointmentsRes.data || []).length} รายการ)</span>
                        </div>
                        <Link href="/dashboard/appointments" className="text-xs font-semibold text-[#2B54F0] hover:text-[#0026A1] inline-flex items-center gap-1">
                            ตารางนัด <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {(todayAppointmentsRes.data || []).length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-400">ไม่มีนัดหมายวันนี้</div>
                        ) : (
                            (todayAppointmentsRes.data || []).map((a) => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const p = (a as any).patients;
                                const name = p ? `${p.first_name} ${p.last_name}` : "—";
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const status = (a as any).status as string;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const start = (a as any).appt_start as string;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const id = (a as any).id as string;
                                return (
                                    <div key={id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                                        <div className="text-xs font-mono text-slate-500 w-12 flex items-center gap-1">
                                            <Clock className="h-3 w-3 text-slate-400" />
                                            {start?.slice(0, 5) || "—"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 truncate">{name}</div>
                                            <div className="text-xs text-slate-500 capitalize">{status}</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}
