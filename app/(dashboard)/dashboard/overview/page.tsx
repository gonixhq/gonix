import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
    Users, Stethoscope,
    Clock, CalendarDays, ArrowRight,
    Pill, UserCog, ClipboardList, CalendarClock, Wallet,
} from "lucide-react";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { getAlerts } from "@/lib/actions/alerts";
import { getOnDutyDoctors, getDoctorsNotCheckedIn } from "@/lib/actions/doctor-shifts";
import { bangkokDate } from "@/lib/utils/date";
import FinanceSummary from "./finance-summary";
import OwnerKpis from "./owner-kpis";
import { Suspense } from "react";
import { listRoomStatuses } from "@/lib/actions/rooms";
import { getActiveAnnouncements } from "@/lib/actions/announcements";
import { getExpiringPackagesCount } from "@/lib/actions/packages";
import { getBusyForecast } from "@/lib/actions/dashboard-forecast";
import { BusyForecastCard } from "./busy-forecast-card";
import { QueueAdvance } from "./queue-advance";
import { DashboardCustomize } from "./dashboard-customize";
import { AutoRefresh, WaitBadge, RealtimeRefresh } from "./overview-live";
import { QueueFunnel, RoomStatusBoard, type FunnelBucket, type RoomLight } from "./queue-funnel";
import { AnnouncementBoard, AddAnnouncementButton } from "./announcement-board";
import { SegmentToggle, type Seg } from "./segment-toggle";
import { Sparkles } from "lucide-react";

// service_category → segment (ความงาม = aesthetic, ที่เหลือ = medical)
const AESTHETIC_CATS = new Set(["aesthetic"]);
function visitSeg(cat: string | null | undefined): "medical" | "aesthetic" {
    return cat && AESTHETIC_CATS.has(cat) ? "aesthetic" : "medical";
}

// service_category → ป้ายภาษาไทย (ใช้แนะนำห้องที่เหมาะกับเคส)
const CAT_TH: Record<string, string> = {
    general_med: "เวชกรรม",
    aesthetic: "ความงาม",
    wound_care: "ทำแผล",
    med_cert: "ใบรับรอง",
    checkup: "ตรวจสุขภาพ",
    std_test: "STD",
};
const catsToTh = (cats: string[] | null | undefined) =>
    cats && cats.length > 0 ? cats.map((c) => CAT_TH[c] || c).join(", ") : null;

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

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ seg?: string }>;
}) {
    const sp = await searchParams;
    const seg: Seg = sp.seg === "medical" || sp.seg === "aesthetic" ? sp.seg : "all";

    const supabase = await createClient();
    const { permissions, clinicId, role } = await getEffectivePermissionsForUser();

    if (!clinicId) return <div role="alert">ไม่พบข้อมูลคลินิก</div>;
    const showFinance = permissions["finance.view"] === true;
    const today = bangkokDate();


    const queueQuery = () => supabase.from("visits")
        .select("vn, visit_date, visit_time, created_at, status, chief_complaint, service_category, room_id, hn, patients!inner(first_name, last_name)")
        .eq("clinic_id", clinicId).lte("visit_date", today).neq("status", "completed").neq("status", "cancelled")
        .order("created_at", { ascending: true }).order("vn");
    // Parallel fetch
    const [
        patientsRes,
        visitsRes,
        staffRes,
        todayQueueRes,
        todayAppointmentsRes,
        pendingStaffRes,
        lowStockRes,
    ] = await Promise.all([
        // 1) Active patients count
        supabase.from("patients").select("hn", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("is_active", true),
        // 2) Today's visits count
        supabase.from("visits").select("vn", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("visit_date", today).neq("status", "cancelled"),
        // 4) Active staff count
        supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("approval_status", "approved").eq("clinic_id", clinicId).eq("is_active", true),
        queueQuery().range(0, 499),
        // 7) Today's appointments (top 6)
        supabase.from("appointments")
            .select("id, appt_start, status, hn, patients!inner(first_name, last_name)", { count: "exact" }).eq("clinic_id", clinicId)
            .eq("appt_date", today)
            .neq("status", "cancelled")
            .order("appt_start", { ascending: true })
            .limit(6),
        // 8) Pending staff count
        supabase.from("profiles").select("id", { count: "exact", head: true })
            .eq("clinic_id", clinicId).eq("approval_status", "pending"),
        // 9) Low stock items
        supabase.from("inventory").select("id, item_name, stock_qty, min_stock, unit", { count: "exact" })
            .eq("clinic_id", clinicId).eq("is_active", true)
            .gt("min_stock", 0)
            .limit(50),
    ]);

    let queueError = !!todayQueueRes.error;
    if (!todayQueueRes.error && todayQueueRes.data?.length === 500) {
        for (let offset = 500; ; offset += 500) {
            const next = await queueQuery().range(offset, offset + 499);
            if (next.error) { queueError = true; break; }
            todayQueueRes.data.push(...(next.data || []));
            if ((next.data?.length || 0) < 500) break;
        }
    }

    // Low stock = items where stock_qty <= min_stock
    const lowStock = (lowStockRes.data || []).filter(
        (i: { stock_qty: number | null; min_stock: number | null }) =>
            (i.stock_qty ?? 0) <= (i.min_stock ?? 0)
    );

    const showStaff = permissions["staff.manage"] === true;
    const showInventory = permissions["inventory.view"] === true;
    const canQueueAction = permissions["visits.edit"] === true;

    // Unified alerts (expiry + outstanding) — สต๊อกต่ำใช้ของเดิม (lowStock) อยู่แล้ว
    const alerts = await getAlerts();
    // คอสใกล้หมดอายุ (≤30 วัน, ยังมีครั้งเหลือ) — แจ้งเตือนเพื่อ cross-sell/ดูแลต่อ
    const expiringPackages = showFinance ? await getExpiringPackagesCount(30) : { count: 0, soonestDays: null };

    // หมอเข้าเวรวันนี้ + ใครเข้าเวรอยู่แต่ยังไม่ check-in ห้อง + สถานะห้อง + ประกาศ
    const [onDuty, notCheckedIn, roomStatuses, announcements, busyForecast] = await Promise.all([
        getOnDutyDoctors(today),
        getDoctorsNotCheckedIn(),
        listRoomStatuses().catch(() => []),
        getActiveAnnouncements().catch(() => []),
        getBusyForecast().catch(() => ({ weeks: 0, hours: [], peakHours: [] })),
    ]);

    // ── Queue Funnel: นับตามสถานะ + หาคนรอเกิน 15 นาที (จาก created_at) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allActiveVisits = (todayQueueRes.data || []) as any[];
    // กรองตาม global segment filter (ทั้งหมด/เวชกรรม/ความงาม)
    const segVisits = seg === "all" ? allActiveVisits : allActiveVisits.filter((v) => visitSeg(v.service_category) === seg);
    const OVERDUE_MS = 15 * 60 * 1000;
    const nowMs = Date.now();
    const isOverdue = (createdAt: string | null) =>
        !!createdAt && nowMs - new Date(createdAt).getTime() >= OVERDUE_MS;

    // กลุ่มสถานะที่ "กำลังรอ" (นับ overdue เฉพาะกลุ่มนี้ — with_doctor ถือว่ากำลังให้บริการ)
    const WAITING_STATUSES = new Set(["waiting", "triaged", "waiting_medicine", "waiting_payment"]);
    const countBy = (statuses: string[]) =>
        segVisits.filter((v) => statuses.includes(v.status)).length;
    const overdueBy = (statuses: string[]) =>
        segVisits.filter(
            (v) => statuses.includes(v.status) && WAITING_STATUSES.has(v.status) && isOverdue(v.created_at),
        ).length;

    const funnelBuckets: FunnelBucket[] = [
        { key: "waiting", label: "รอซักประวัติ", count: countBy(["waiting"]), overdue: overdueBy(["waiting"]), tile: "bg-amber-100", text: "text-amber-700", href: "/dashboard/screening" },
        { key: "triaged", label: "รอพบแพทย์", count: countBy(["triaged"]), overdue: overdueBy(["triaged"]), tile: "bg-blue-100", text: "text-blue-700", href: "/dashboard/doctor-station" },
        { key: "with_doctor", label: "กำลังพบแพทย์", count: countBy(["with_doctor", "with_nurse"]), overdue: 0, tile: "bg-indigo-100", text: "text-indigo-700", href: "/dashboard/doctor-station" },
        { key: "waiting_medicine", label: "รอรับยา", count: countBy(["waiting_medicine"]), overdue: overdueBy(["waiting_medicine"]), tile: "bg-purple-100", text: "text-purple-700", href: "/dashboard/pharmacy" },
        { key: "waiting_payment", label: "รอชำระเงิน", count: countBy(["waiting_payment"]), overdue: overdueBy(["waiting_payment"]), tile: "bg-orange-100", text: "text-orange-700", href: "/dashboard/pharmacy" },
    ];

    // ── ไฟจราจรห้องตรวจ (กรองตาม segment — ห้องที่ไม่ระบุหมวด = ใช้ได้ทุกแผนก) ──
    const roomMatchesSeg = (cats: string[] | null | undefined) => {
        if (seg === "all" || !cats || cats.length === 0) return true;
        return seg === "aesthetic"
            ? cats.includes("aesthetic")
            : cats.some((c) => c !== "aesthetic");
    };
    // auto room sync: ห้องที่มีคนไข้กำลังตรวจอยู่ (visit status=with_doctor + room_id) → busy
    // (พอ visit เปลี่ยนสถานะ/จบ ห้องจะว่างเองอัตโนมัติ — ไม่ต้องกดเปลี่ยนมือ)
    const roomOccupant = new Map<string, string>();
    for (const v of allActiveVisits) {
        if (v.status === "with_doctor" && v.room_id) {
            const p = v.patients;
            roomOccupant.set(v.room_id, p ? `${p.first_name} ${p.last_name}` : "กำลังตรวจ");
        }
    }
    const roomLights: RoomLight[] = (roomStatuses || [])
        .filter((r) => (r.is_active || r.active_session_id || roomOccupant.has(r.room_id)) && roomMatchesSeg(r.service_categories))
        .map((r) => {
            const occupant = roomOccupant.get(r.room_id);
            const busy = !!r.active_session_id || !!occupant;
            return {
                room_id: r.room_id,
                room_name: r.room_name,
                state: !r.is_active && !occupant ? "off" : busy ? "busy" : "free",
                detail: occupant ?? r.assigned_doctors?.[0]?.name ?? null,
                serves: catsToTh(r.service_categories),
            };
        });

    // top 6 สำหรับ list คิว (ตาม filter)
    const queueList = segVisits.slice(0, 6);

    // ── No-show flag: นับประวัติไม่มาตามนัดของคนไข้ในรายการนัดวันนี้ ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todayApptRows = (todayAppointmentsRes.data || []) as any[];
    const apptHns = [...new Set(todayApptRows.map((a) => a.hn).filter(Boolean))];
    const noShowByHn = new Map<string, number>();
    if (apptHns.length > 0) {
        // นัดในอดีต (ก่อนวันนี้) ที่ยกเลิก หรือ ยังค้างไม่ปิด = ถือว่าไม่มาตามนัด
        const { data: pastAppts } = await supabase
            .from("appointments")
            .select("hn, status")
            .eq("clinic_id", clinicId).in("hn", apptHns)
            .lt("appt_date", today);
        for (const r of pastAppts || []) {
            const st = (r as { status: string }).status;
            if (st === "no_show") {
                const hn = (r as { hn: string }).hn;
                noShowByHn.set(hn, (noShowByHn.get(hn) || 0) + 1);
            }
        }
    }

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

    // การ์ดภาพรวมธุรกิจ — เฉพาะผู้จัดการ/เจ้าของ (พนักงานทั่วไปเห็นแค่ "ผลงานวันนี้")
    // "คิววันนี้" ตัดออก เพราะซ้ำกับ "เคสวันนี้" ใน ผลงานวันนี้
    const statCards = [
        ...(showStaff ? [{ label: "ผู้ป่วยทั้งหมด", value: patientsRes.count?.toLocaleString() || "0", sub: "ทะเบียนที่ใช้งานอยู่", icon: Users, tile: "bg-[#2B54F0]/10", iconColor: "text-[#2B54F0]", glow: "from-[#2B54F0]/20 to-[#5F85FF]/5" }] : []),
        ...(showStaff ? [{ label: "พนักงาน", value: staffRes.count?.toString() || "0", sub: "พนักงานที่ใช้งานอยู่", icon: Stethoscope, tile: "bg-[#6366F1]/10", iconColor: "text-[#6366F1]", glow: "from-[#6366F1]/20 to-[#8B5CF6]/5" }] : []),
    ];

    return (
        <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
            {/* ════════ Hero banner — branded, ties to login orb ════════ */}
            <div
                className="relative overflow-hidden rounded-3xl p-5 sm:p-6"
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
                    <h1 className="text-xl sm:text-2xl font-semibold text-slate-800 tracking-tight mt-1 leading-tight truncate">
                        {displayName}
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        <p className="text-slate-500 text-sm inline-flex items-center gap-2" suppressHydrationWarning>
                            <CalendarDays className="h-4 w-4 text-[#2B54F0]" /> {fullDate} · อัปเดต {new Date().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {clinicId && <RealtimeRefresh clinicId={clinicId} />}
                        <AutoRefresh seconds={180} />
                    </div>
                </div>
            </div>

            {/* Toolbar: segment filter + customize */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    <SegmentToggle current={seg} />
                    {seg !== "all" && (
                        <span className="text-xs text-slate-500">กำลังกรอง: คิว + ห้องตรวจ ตามแผนก{seg === "aesthetic" ? "ความงาม" : "เวชกรรม"}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {showStaff && <AddAnnouncementButton />}
                    <DashboardCustomize />
                </div>
            </div>

            {/* Announcement board */}
            <div data-widget="announce">
                <AnnouncementBoard announcements={announcements} canManage={showStaff} />
            </div>

            <section className="gonix-card-premium p-5" data-widget="perf">
                <h2 className="text-base font-semibold text-slate-800 mb-3">งานวันนี้</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: "เคสวันนี้", value: visitsRes.error ? "—" : visitsRes.count || 0, href: "/dashboard/screening" },
                        { label: "รอพบแพทย์", value: queueError ? "—" : countBy(["triaged"]), href: "/dashboard/doctor-station" },
                        { label: "รอรับยา / ชำระเงิน", value: queueError ? "—" : countBy(["waiting_medicine", "waiting_payment"]), href: "/dashboard/pharmacy" },
                        { label: "นัดหมายวันนี้", value: todayAppointmentsRes.error ? "—" : todayAppointmentsRes.count || 0, href: "/dashboard/appointments" },
                    ].map(card => <Link key={card.label} href={card.href} className="rounded-2xl bg-white/70 border border-slate-200 p-4 hover:border-blue-300">
                        <p className="text-sm text-slate-600">{card.label}</p><p className="text-3xl font-semibold text-slate-900 mt-1 tabular-nums">{card.value}</p>
                    </Link>)}
                </div>
                <p className="text-xs text-slate-600 mt-3">เคสและนัดหมายวันนี้: ทั้งคลินิก · คิวรอ: ตามแผนกที่เลือก รวมคิวค้างจากวันก่อน</p>
            </section>

            {/* Queue funnel — สถานะคิววันนี้ + เตือนรอเกิน 15 นาที */}
            <div data-widget="funnel">
                {queueError ? <p role="alert" className="gonix-card-premium p-5">โหลดคิวไม่ครบ กรุณารีเฟรชหน้า</p> : <QueueFunnel buckets={funnelBuckets} />}
            </div>

            {/* Row: Today's queue + appointments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" data-widget="queues">
                {/* Today's queue */}
                <div className="gonix-card-premium overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 bg-slate-50/40">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-slate-600" />
                            <h2 className="text-sm font-bold text-slate-800">คิวที่ต้องจัดการ</h2>
                            <span className="text-xs text-slate-500">({segVisits.length} รายการ · แสดง {queueList.length})</span>
                        </div>
                        <Link href="/dashboard/screening" className="text-xs font-semibold text-[#2B54F0] hover:text-[#0026A1] inline-flex items-center gap-1">
                            ดูคิวทั้งหมด <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {queueError ? <p role="alert" className="p-5">โหลดคิวไม่สำเร็จ กรุณารีเฟรชหน้า</p> : queueList.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500">ไม่มีคิวที่ต้องจัดการ</div>
                        ) : (
                            queueList.map((v) => {
                                const p = v.patients;
                                const name = p ? `${p.first_name} ${p.last_name}` : "—";
                                const status = v.status as string;
                                const visitTime = v.visit_time as string;
                                const chiefComplaint = v.chief_complaint;
                                const vn = v.vn as string;
                                const waiting = WAITING_STATUSES.has(status);
                                return (
                                    <div key={vn} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                                        <div className="text-xs font-mono text-slate-500 w-12">{visitTime?.slice(0, 5) || "—"}</div>
                                        <Link href={status === "waiting" ? `/dashboard/screening/${vn}` : ["waiting_medicine", "waiting_payment"].includes(status) ? `/dashboard/pharmacy/${vn}` : `/dashboard/visits/${vn}`} className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 truncate hover:text-[#2B54F0]">{name}</div>
                                            {chiefComplaint && <div className="text-sm text-slate-600 truncate">{chiefComplaint}</div>}
                                        </Link>
                                        {v.visit_date < today && <span className="text-xs text-amber-700">คิวค้าง</span>}
                                        {waiting && <span title="เวลาตั้งแต่เปิด Visit"><WaitBadge since={v.created_at} /></span>}
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}>
                                            {STATUS_LABEL[status] || status}
                                        </span>
                                        {canQueueAction && <QueueAdvance vn={vn} status={status} />}
                                    </div>
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
                            <span className="text-xs text-slate-500">({todayAppointmentsRes.count || 0} รายการ)</span>
                        </div>
                        <Link href="/dashboard/appointments" className="text-xs font-semibold text-[#2B54F0] hover:text-[#0026A1] inline-flex items-center gap-1">
                            ดูทั้งหมด <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {todayAppointmentsRes.error ? <p role="alert" className="p-5">โหลดนัดหมายไม่สำเร็จ กรุณารีเฟรชหน้า</p> : (todayAppointmentsRes.data || []).length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500">ไม่มีนัดหมายวันนี้</div>
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
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const hn = (a as any).hn as string;
                                const noShows = noShowByHn.get(hn) || 0;
                                return (
                                    <div key={id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                                        <div className="text-xs font-mono text-slate-500 w-12 flex items-center gap-1">
                                            <Clock className="h-3 w-3 text-slate-500" />
                                            {start?.slice(0, 5) || "—"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                                                {name}
                                                {noShows >= 2 && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-700 shrink-0" title="เคยไม่มาตามนัดหลายครั้ง — ควรโทรย้ำ">
                                                        เสี่ยงไม่มา ×{noShows}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 capitalize">{status}</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Room traffic light */}
            <div data-widget="rooms">
                <RoomStatusBoard rooms={roomLights} />
            </div>

            {showFinance && <FinanceSummary today={today} />}
            {role === "owner" && (
                <Suspense fallback={<div className="rounded-2xl bg-white/60 border border-white/80 p-6 text-center text-xs text-slate-400">กำลังคำนวณ KPI การเงิน…</div>}>
                    <OwnerKpis />
                </Suspense>
            )}
            {/* Stat cards (ภาพรวมธุรกิจ — แสดงเฉพาะเมื่อมีการ์ด) */}
            {statCards.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
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
                                    <p className="text-xs text-slate-500 mt-0.5">{s.sub}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Row: On-duty + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start" data-widget="onduty">
                {/* On-duty doctors today */}
                <div className="gonix-card-premium p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-[#2B54F0]" />
                        <h2 className="text-base font-bold text-slate-800">หมอเข้าเวรวันนี้</h2>
                        <span className="text-xs text-slate-500">({onDuty.length})</span>
                    </div>
                    {showStaff && (
                        <Link href="/dashboard/doctor-schedule" className="text-xs font-semibold text-[#2B54F0] hover:text-[#0026A1] inline-flex items-center gap-1">
                            จัดการเวร <ArrowRight className="h-3 w-3" />
                        </Link>
                    )}
                </div>
                {notCheckedIn.length > 0 && (
                    <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700">
                        เข้าเวรอยู่แต่ยังไม่ check-in ห้อง: {notCheckedIn.join(", ")}
                    </div>
                )}
                {onDuty.length === 0 ? (
                    <p className="text-sm text-slate-500 py-2">ยังไม่ได้ลงเวรแพทย์สำหรับวันนี้</p>
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

                        {/* Expiring courses (คอสใกล้หมดอายุ) */}
                        {showFinance && expiringPackages.count > 0 && (
                            <Link href="/dashboard/packages" className="block group">
                                <div className="rounded-xl bg-violet-50/70 border border-violet-200/60 p-3 hover:bg-violet-100/60 transition-colors flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-violet-900">คอสใกล้หมดอายุ</div>
                                        <div className="text-xs text-violet-700">
                                            {expiringPackages.count} คอส (≤30 วัน){expiringPackages.soonestDays !== null ? ` · ใกล้สุด ${expiringPackages.soonestDays} วัน` : ""} — ตามลูกค้าต่อ
                                        </div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-violet-500 group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </Link>
                        )}

                        {/* No alerts */}
                        {(!showStaff || (pendingStaffRes.count || 0) === 0)
                            && (!showInventory || lowStock.length === 0)
                            && (!showInventory || alerts.expired === 0)
                            && (!showInventory || alerts.expiringSoon === 0)
                            && (!showFinance || alerts.outstanding === 0)
                            && (!showFinance || expiringPackages.count === 0) && (
                            <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/60 p-4 text-center">
                                <div className="text-sm font-bold text-emerald-800 mb-1"> ไม่มีรายการเร่งด่วน</div>
                                <div className="text-xs text-emerald-700">ระบบทำงานปกติ</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Busy-period forecast — ข้อมูลเสริม ไว้ล่างสุด */}
            <div data-widget="forecast">
                <BusyForecastCard forecast={busyForecast} nowHour={bkkHour} />
            </div>

        </div>
    );
}
