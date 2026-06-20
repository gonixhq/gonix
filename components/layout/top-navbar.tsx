"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Settings } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useLanguage } from "@/lib/i18n";
import NotificationBell from "./notification-bell";

interface TopNavbarProps {
    user: SupabaseUser;
    clinicName: string;
    logoUrl?: string;
    userName?: string | null;
    userRole?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของคลินิก", admin: "ผู้ดูแลระบบ", doctor: "แพทย์", dentist: "ทันตแพทย์",
    nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "นักกายภาพบำบัด", receptionist: "เจ้าหน้าที่ต้อนรับ",
    accountant: "เจ้าหน้าที่บัญชี", assistant: "ผู้ช่วย", staff: "พนักงาน",
};

// ────────────────────────────────────────────────
// Page title mapping — เรียงจาก specific → general
// ใช้ regex หา dynamic routes ก่อน, แล้ว exact match
// ────────────────────────────────────────────────
type TitleEntry = { pattern: RegExp | string; th: string; en: string; sub?: { th: string; en: string } };

const PAGE_TITLES: TitleEntry[] = [
    // Dynamic routes (regex)
    { pattern: /^\/dashboard\/screening\/[^/]+$/, th: "ซักประวัติ", en: "Screening", sub: { th: "บันทึก Vital Signs + คัดกรอง", en: "Vitals + Triage" } },
    { pattern: /^\/dashboard\/visits\/new$/, th: "สร้าง Visit ใหม่", en: "New Visit", sub: { th: "เคาท์เตอร์ลงทะเบียน", en: "Front-desk registration" } },
    { pattern: /^\/dashboard\/visits\/[^/]+$/, th: "ตรวจคนไข้", en: "Examination", sub: { th: "Doctor workspace", en: "Doctor workspace" } },
    { pattern: /^\/dashboard\/patients\/new$/, th: "เพิ่มผู้ป่วยใหม่", en: "New Patient" },
    { pattern: /^\/dashboard\/patients\/deleted-log$/, th: "ประวัติการลบผู้ป่วย", en: "Deleted Patients Log" },
    { pattern: /^\/dashboard\/patients\/[^/]+$/, th: "ข้อมูลผู้ป่วย", en: "Patient Profile" },
    { pattern: /^\/dashboard\/settings\/rooms$/, th: "จัดการห้องตรวจ", en: "Consultation Rooms" },
    { pattern: /^\/dashboard\/settings\/services$/, th: "รายการบริการ & ราคา", en: "Services & Pricing" },
    { pattern: /^\/dashboard\/settings\/formulas$/, th: "สูตรยา / วิตามิน", en: "Drug / Vitamin Formulas", sub: { th: "ชุดยา/วิตามินสำเร็จรูป", en: "Drug/vitamin presets" } },

    // Exact paths
    { pattern: "/dashboard/overview", th: "ภาพรวมคลินิก", en: "Overview" },
    { pattern: "/dashboard/patients", th: "ทะเบียนผู้ป่วย", en: "Patients" },
    { pattern: "/dashboard/appointments", th: "นัดหมาย", en: "Appointments" },
    { pattern: "/dashboard/screening", th: "เปิด Visit & ซักประวัติ", en: "Open Visit & Screening" },
    { pattern: "/dashboard/doctor-station", th: "ห้องแพทย์", en: "Doctor Station", sub: { th: "Doctor Room", en: "Doctor Room" } },
    { pattern: "/dashboard/doctor-schedule", th: "ตารางเวรการทำงาน", en: "Work Schedule", sub: { th: "เวรรายวัน", en: "Daily roster" } },
    { pattern: "/dashboard/compensation", th: "ค่าตอบแทนพนักงาน", en: "Compensation", sub: { th: "ค่าเวลา + DF", en: "Time pay + DF" } },
    { pattern: "/dashboard/pharmacy", th: "ห้องยา & รับเงิน", en: "Pharmacy & Payment" },
    { pattern: "/dashboard/lab", th: "ห้องแล็บ", en: "Lab" },
    { pattern: /^\/dashboard\/anonymous\/[^/]+$/, th: "เคสนิรนาม", en: "Anonymous Case", sub: { th: "ตรวจเลือดไม่ระบุตัวตน", en: "Anonymous testing" } },
    { pattern: "/dashboard/anonymous", th: "คลินิกนิรนาม", en: "Anonymous Clinic", sub: { th: "ตรวจเลือดไม่ระบุตัวตน", en: "Anonymous blood testing" } },
    { pattern: "/dashboard/inventory", th: "คลังสินค้า", en: "Inventory" },
    { pattern: "/dashboard/finance", th: "การเงิน", en: "Finance" },
    { pattern: "/dashboard/eod", th: "ปิดยอดประจำวัน", en: "End of Day" },
    { pattern: "/dashboard/reports", th: "รายงาน", en: "Reports" },
    { pattern: "/dashboard/insights", th: "รายงานธุรกิจ", en: "Business Insights", sub: { th: "วิเคราะห์ยอดขาย/ลูกค้า", en: "Sales & customer analytics" } },
    { pattern: "/dashboard/branches", th: "สาขา", en: "Branches" },
    { pattern: "/dashboard/staff", th: "จัดการพนักงาน", en: "Staff" },
    { pattern: "/dashboard/audit", th: "ประวัติการดำเนินการ", en: "Activity Log" },
    { pattern: "/dashboard/settings", th: "ตั้งค่าระบบ", en: "Settings" },
    { pattern: "/dashboard", th: "กระดานคิว", en: "Queue Board", sub: { th: "OPD Queue Board", en: "OPD Queue Board" } },
];

function resolveTitle(pathname: string, lang: "th" | "en"): { title: string; sub?: string } {
    for (const entry of PAGE_TITLES) {
        const matched = entry.pattern instanceof RegExp
            ? entry.pattern.test(pathname)
            : pathname === entry.pattern;
        if (matched) {
            return {
                title: lang === "en" ? entry.en : entry.th,
                sub: entry.sub ? (lang === "en" ? entry.sub.en : entry.sub.th) : undefined,
            };
        }
    }
    return { title: "Dashboard" };
}

export default function TopNavbar({ user, userName, userRole }: TopNavbarProps) {
    const router = useRouter();
    const supabase = createClient();
    const { t, language } = useLanguage();
    const pathname = usePathname();
    const { title: pageTitle, sub: pageSub } = resolveTitle(pathname, language);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    const displayName = userName || user.user_metadata?.full_name || user.email || "User";
    const roleText = userRole ? (ROLE_LABEL[userRole] || userRole) : (user.email ?? "");
    const initials = displayName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <header
            className="h-[68px] flex items-center justify-between px-6 shrink-0 z-40 relative"
            style={{
                background: "linear-gradient(180deg, #1C2244 0%, #161C38 100%)",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 8px 30px rgba(10,14,30,0.15)",
            }}
        >
            {/* Mesh accent — subtle, same palette as login */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: [
                        "radial-gradient(at 92% 0%, rgba(0,255,204,0.16) 0px, transparent 38%)",
                        "radial-gradient(at 35% 130%, rgba(43,84,240,0.20) 0px, transparent 50%)",
                    ].join(", "),
                }}
            />
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.10] mix-blend-overlay"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
            />

            {/* Left: Page Title */}
            <div className="relative z-10 flex flex-col justify-center min-w-0">
                <h1 className="text-xl font-black text-white tracking-tight leading-tight truncate">
                    {pageTitle}
                </h1>
                {pageSub && (
                    <span className="text-[11px] font-semibold tracking-wide mt-0.5 truncate" style={{ color: "#00FFCC" }}>
                        {pageSub}
                    </span>
                )}
            </div>

            {/* Right actions */}
            <div className="relative z-10 flex items-center gap-3">
                {/* Settings */}
                <Link
                    href="/dashboard/settings"
                    title={language === "en" ? "Settings" : "ตั้งค่าระบบ"}
                    className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/10 border border-white/15 hover:bg-white/20 text-white/60 hover:text-[#00FFCC] transition-all duration-300 group"
                >
                    <Settings className="h-5 w-5 group-hover:rotate-45 transition-transform duration-500" />
                </Link>

                {/* Notifications */}
                <NotificationBell />

                {/* Divider */}
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent mx-1" />

                {/* User */}
                <div className="flex items-center gap-3 pl-2">
                    <div className="flex flex-col items-end hidden sm:flex">
                        <span className="text-[13px] font-bold text-white leading-tight">
                            {displayName}
                        </span>
                        <span className="text-[11px] font-semibold text-white/45">
                            {roleText}
                        </span>
                    </div>

                    {/* Avatar — cyan → mint, matches login CTA */}
                    <div
                        className="h-10 w-10 rounded-full flex items-center justify-center transform hover:scale-105 transition-all"
                        style={{ background: "linear-gradient(135deg, #00FFCC 0%, #15FF83 100%)", boxShadow: "0 8px 20px rgba(0,255,204,0.3)" }}
                    >
                        <span className="text-[#0A1020] text-xs font-bold tracking-wider">{initials}</span>
                    </div>

                    <button
                        onClick={handleSignOut}
                        title={t("logout")}
                        className="h-10 w-10 ml-1 rounded-xl flex items-center justify-center bg-white/10 border border-white/15 hover:bg-red-500/20 text-white/60 hover:text-red-300 transition-all duration-300"
                    >
                        <LogOut className="h-[18px] w-[18px]" />
                    </button>
                </div>
            </div>
        </header>
    );
}
