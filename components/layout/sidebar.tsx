"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getAlertsShared } from "@/lib/alerts-cache";
import {
    LayoutDashboard,
    Users,
    CalendarDays,
    Pill,
    BarChart3,
    Settings,
    ChevronLeft,
    ChevronRight,
    Building2,
    FlaskConical, Percent, Trash2,
    ShieldCheck,
    Ticket,
    BadgeDollarSign,
    Stethoscope,
    ClipboardList,
    Box,
    UserCog,
    History,
    DoorClosed,
    DoorOpen,
    HandCoins,
    CalendarClock,
    Wallet,
    ChevronDown,
    Search,
    X,
    Home,
    Megaphone,
    Coins,
    Package,
    UsersRound,
    SlidersHorizontal,
    ClipboardCheck,
} from "lucide-react";

import { useLanguage } from "@/lib/i18n";

type NavItem = { href: string; tKey: string; icon: React.ElementType; adminOnly?: boolean; permKey?: string };
type NavGroup = { group: string; th: string; en: string; icon: React.ElementType; items: NavItem[] };

// จัดตามงานจริงของคลินิก · หมวดพับ/กางได้ (จำสถานะไว้) · หมวดที่มีหน้าปัจจุบันกางเอง
const NAV_ITEMS: NavGroup[] = [
    {
        group: "HOME", th: "", en: "", icon: Home,
        items: [
            { href: "/dashboard/overview", tKey: "dashboard", icon: LayoutDashboard },
        ],
    },
    {
        group: "DAILY", th: "งานประจำวัน", en: "Daily Work", icon: ClipboardCheck,
        items: [
            { href: "/dashboard/patients", tKey: "patients", icon: Users, permKey: "patients.view" },
            { href: "/dashboard/appointments", tKey: "appointments", icon: CalendarDays, permKey: "appointments.view" },
            { href: "/dashboard/screening", tKey: "screening", icon: ClipboardList, permKey: "visits.edit" },
            { href: "/dashboard/doctor-station", tKey: "doctorStation", icon: Stethoscope, permKey: "visits.edit" },
            { href: "/dashboard/pharmacy", tKey: "pharmacy", icon: Pill, permKey: "pharmacy.view" },
            { href: "/dashboard/lab", tKey: "lab", icon: FlaskConical, permKey: "lab.view" },
            { href: "/dashboard/anonymous", tKey: "anonymous", icon: ShieldCheck, permKey: "anon.view" },
            { href: "/dashboard/checkin", tKey: "checkin", icon: CalendarClock },
        ],
    },
    {
        group: "SALES", th: "ติดตาม & การขาย", en: "Follow-up & Sales", icon: Megaphone,
        items: [
            { href: "/dashboard/follow-up", tKey: "followUp", icon: ClipboardList, permKey: "patients.view" },
            { href: "/dashboard/pre-orders", tKey: "preOrders", icon: ClipboardList, permKey: "pre_order.view" },
            { href: "/dashboard/campaigns", tKey: "campaigns", icon: Ticket, permKey: "campaign.view" },
            { href: "/dashboard/price-approvals", tKey: "priceApprovals", icon: ShieldCheck, adminOnly: true, permKey: "finance.view" },
        ],
    },
    {
        group: "FINANCE", th: "การเงิน", en: "Finance", icon: Coins,
        items: [
            { href: "/dashboard/finance", tKey: "finance", icon: BadgeDollarSign, permKey: "finance.view" },
            { href: "/dashboard/eod", tKey: "eod", icon: DoorClosed, permKey: "finance.eod" },
            { href: "/dashboard/commissions", tKey: "commissions", icon: HandCoins, permKey: "finance.view" },
            { href: "/dashboard/reports", tKey: "reports", icon: BarChart3, permKey: "reports.view" },
        ],
    },
    {
        group: "STOCK", th: "คลังสินค้า", en: "Inventory", icon: Package,
        items: [
            { href: "/dashboard/inventory", tKey: "inventory", icon: Box, permKey: "inventory.view" },
            { href: "/dashboard/inventory/waste", tKey: "stockWaste", icon: Trash2, permKey: "inventory.view" },
        ],
    },
    {
        group: "STAFF", th: "พนักงาน", en: "Staff", icon: UsersRound,
        items: [
            { href: "/dashboard/staff", tKey: "staff", icon: UserCog, adminOnly: true, permKey: "staff.manage" },
            { href: "/dashboard/doctor-schedule", tKey: "doctorSchedule", icon: CalendarClock, adminOnly: true, permKey: "staff.manage" },
            { href: "/dashboard/compensation", tKey: "compensation", icon: Wallet, adminOnly: true, permKey: "staff.manage" },
            { href: "/dashboard/audit", tKey: "audit", icon: History, adminOnly: true, permKey: "staff.manage" },
        ],
    },
    {
        group: "SETTINGS", th: "ตั้งค่า", en: "Settings", icon: SlidersHorizontal,
        items: [
            { href: "/dashboard/settings/services", tKey: "services", icon: BadgeDollarSign, adminOnly: true, permKey: "settings.edit" },
            { href: "/dashboard/settings/formulas", tKey: "formulas", icon: FlaskConical, adminOnly: true, permKey: "settings.edit" },
            { href: "/dashboard/settings/rooms", tKey: "rooms", icon: DoorOpen, adminOnly: true, permKey: "rooms.manage" },
            { href: "/dashboard/settings/finance-rates", tKey: "financeRates", icon: Percent, adminOnly: true, permKey: "settings.edit" },
            { href: "/dashboard/branches", tKey: "branches", icon: Building2, adminOnly: true, permKey: "branches.manage" },
            { href: "/dashboard/settings", tKey: "settings", icon: Settings },
        ],
    },
];

const OPEN_KEY = "gonix.sidebar.openGroups";

export default function Sidebar({
    clinicName,
    branchName,
    role,
    permissions,
}: {
    clinicName: string;
    branchName?: string;
    role?: string;
    permissions?: Record<string, boolean>;
}) {
    const isAdmin = role === "owner" || role === "admin";
    const visibleGroups: NavGroup[] = NAV_ITEMS.map((g) => ({
        ...g,
        items: g.items.filter((it) => {
            if (it.adminOnly && !isAdmin) return false;
            if (it.permKey && permissions && permissions[it.permKey] === false) return false;
            return true;
        }),
    })).filter((g) => g.items.length > 0);
    const pathname = usePathname();
    const { t, language } = useLanguage();
    const [collapsed, setCollapsed] = useState(false);
    const [query, setQuery] = useState("");
    // หมวดที่กางอยู่ (จำไว้ใน browser) — default กาง "งานประจำวัน"
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ DAILY: true });
    useEffect(() => {
        try { const raw = localStorage.getItem(OPEN_KEY); if (raw) setOpenGroups(JSON.parse(raw)); } catch { /* ignore */ }
    }, []);
    const toggleGroup = (g: string) => setOpenGroups(prev => {
        const next = { ...prev, [g]: !prev[g] };
        try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
    });

    // Badge counts ต่อเมนู (สต๊อกต่ำ+หมดอายุ → inventory, ค้างชำระ → finance)
    const [badges, setBadges] = useState<Record<string, number>>({});
    useEffect(() => {
        let mounted = true;
        getAlertsShared().then(a => {
            if (!mounted) return;
            setBadges({
                "/dashboard/inventory": a.lowStock + a.expired + a.expiringSoon,
                "/dashboard/finance": a.outstanding,
            });
        });
        const interval = setInterval(() => {
            getAlertsShared().then(a => {
                if (!mounted) return;
                setBadges({
                    "/dashboard/inventory": a.lowStock + a.expired + a.expiringSoon,
                    "/dashboard/finance": a.outstanding,
                });
            });
        }, 5 * 60 * 1000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    // หา nav item ที่ match pathname ยาวที่สุด เพื่อกันกรณี sub-route active parent ด้วย
    // (เช่น /dashboard/settings/rooms ไม่ควรทำให้ /dashboard/settings active ไปด้วย)
    const activeHref: string | null = (() => {
        const allItems = visibleGroups.flatMap((g) => g.items);
        let best: { href: string; len: number } | null = null;
        for (const it of allItems) {
            const itemPath = it.href.split("?")[0];
            const matches = it.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === itemPath || pathname.startsWith(itemPath + "/");
            if (matches && (!best || itemPath.length > best.len)) {
                best = { href: it.href, len: itemPath.length };
            }
        }
        return best?.href ?? null;
    })();

    return (
        <aside
            className={cn(
                "flex flex-col h-full transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] z-50 relative overflow-hidden",
                collapsed ? "w-[88px]" : "w-[280px]"
            )}
            style={{
                background: "linear-gradient(170deg, #1C2244 0%, #141A33 100%)",
                borderRight: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "8px 0 40px rgba(10,14,30,0.22)",
            }}
        >
            {/* Vibrant mesh — subtle so white menu text stays crisp */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: [
                        "radial-gradient(at 20% 6%, rgba(10,218,255,0.26) 0px, transparent 45%)",
                        "radial-gradient(at 85% 0%, rgba(0,255,204,0.18) 0px, transparent 42%)",
                        "radial-gradient(at 50% 100%, rgba(43,84,240,0.28) 0px, transparent 55%)",
                        "radial-gradient(at 12% 88%, rgba(21,255,131,0.14) 0px, transparent 45%)",
                    ].join(", "),
                }}
            />
            {/* Grain overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-overlay"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
            />

            {/* Clinic / Branch Header */}
            <div
                className={cn(
                    "shrink-0 border-b border-white/10 bg-white/[0.03] relative z-10",
                    collapsed ? "px-2 h-[88px] flex items-center justify-center" : "px-4 py-4"
                )}
            >
                {collapsed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src="/clinic-logo.png"
                        alt={clinicName}
                        title={branchName}
                        className="h-auto w-auto max-h-7 max-w-[60px] object-contain"
                        style={{ filter: "brightness(0) invert(1)" }}
                    />
                ) : (
                    <div className="flex items-center justify-center min-w-0 py-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/clinic-logo.png"
                            alt={clinicName}
                            title={branchName}
                            className="h-14 w-auto max-w-[220px] object-contain"
                            style={{ filter: "brightness(0) invert(1)" }}
                        />
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden py-4 custom-scrollbar relative z-10", collapsed ? "px-2 space-y-2" : "px-3 space-y-1")}>
                {/* ค้นหาเมนู */}
                {!collapsed && (
                    <div className="relative mb-3 px-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder={language === "en" ? "Search menu…" : "ค้นหาเมนู…"}
                            className="w-full h-10 rounded-xl bg-white/10 border border-white/10 pl-9 pr-8 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#00FFCC]/50" />
                        {query && <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white" aria-label="ล้าง"><X className="h-4 w-4" /></button>}
                    </div>
                )}

                {(() => {
                    const q = query.trim().toLowerCase();
                    const renderItem = (item: NavItem) => {
                        const Icon = item.icon;
                        const isActive = item.href === activeHref;
                        const badgeCount = badges[item.href] || 0;
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    onClick={() => setQuery("")}
                                    title={collapsed ? t(item.tKey) : undefined}
                                    className={cn(
                                        "flex items-center group relative px-3 py-2.5 rounded-xl text-[14.5px] border border-transparent transition-all duration-300",
                                        collapsed ? "justify-center px-0 w-12 mx-auto" : "gap-3",
                                        isActive ? "font-semibold text-[#00FFCC]" : "font-medium text-white/70 hover:bg-white/10 hover:text-white"
                                    )}
                                    style={isActive ? { background: "rgba(0,255,204,0.12)", borderColor: "rgba(0,255,204,0.25)" } : undefined}
                                >
                                    {isActive && !collapsed && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                                            style={{ background: "linear-gradient(to bottom, #00FFCC, #15FF83)", boxShadow: "0 0 12px rgba(0,255,204,0.7)" }} />
                                    )}
                                    <div className="relative shrink-0">
                                        <Icon className={cn("h-[18px] w-[18px] transition-transform duration-300", isActive ? "" : "group-hover:scale-110")}
                                            style={isActive ? { color: "#00FFCC" } : undefined} />
                                        {collapsed && badgeCount > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                                                {badgeCount > 9 ? "9+" : badgeCount}
                                            </span>
                                        )}
                                    </div>
                                    {!collapsed && <span className="truncate flex-1 tracking-tight">{t(item.tKey)}</span>}
                                    {!collapsed && badgeCount > 0 && (
                                        <span className="relative z-10 h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                                            {badgeCount > 99 ? "99+" : badgeCount}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        );
                    };

                    // ── โหมดค้นหา: รายการเดียวเรียงต่อกัน ──
                    if (q && !collapsed) {
                        const hits = visibleGroups.flatMap(g => g.items.map(it => ({ it, g }))).filter(({ it, g }) =>
                            t(it.tKey).toLowerCase().includes(q) || (language === "en" ? g.en : g.th).toLowerCase().includes(q));
                        return hits.length === 0
                            ? <p className="px-3 py-6 text-center text-sm text-white/40">{language === "en" ? "No menu found" : "ไม่พบเมนู"}</p>
                            : <ul className="space-y-1">{hits.map(({ it }) => renderItem(it))}</ul>;
                    }

                    // ── โหมดย่อ (ไอคอน): แสดงทุกไอคอน คั่นด้วยเส้นระหว่างหมวด ──
                    if (collapsed) {
                        return visibleGroups.map((group, idx) => (
                            <div key={group.group}>
                                <ul className="space-y-1">{group.items.map(renderItem)}</ul>
                                {idx < visibleGroups.length - 1 && <div className="h-px bg-white/10 my-2 mx-2" />}
                            </div>
                        ));
                    }

                    // ── โหมดปกติ: หมวดพับ/กางได้ ──
                    return visibleGroups.map((group) => {
                        if (!group.th) return <ul key={group.group} className="space-y-1 mb-2">{group.items.map(renderItem)}</ul>;
                        const hasActive = group.items.some(it => it.href === activeHref);
                        const open = !!openGroups[group.group] || hasActive;
                        const GIcon = group.icon;
                        const groupBadge = group.items.reduce((s, it) => s + (badges[it.href] || 0), 0);
                        return (
                            <div key={group.group}>
                                <button type="button" onClick={() => toggleGroup(group.group)} aria-expanded={open}
                                    className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-colors",
                                        hasActive ? "text-white" : "text-white/55 hover:text-white hover:bg-white/5")}>
                                    <GIcon className="h-4 w-4 shrink-0" />
                                    <span className="flex-1 text-left tracking-wide">{language === "en" ? group.en : group.th}</span>
                                    {!open && groupBadge > 0 && <span className="h-2 w-2 rounded-full bg-red-500" />}
                                    {!open && <span className="text-[11px] font-semibold text-white/35">{group.items.length}</span>}
                                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open ? "" : "-rotate-90")} />
                                </button>
                                {open && <ul className="space-y-1 mt-0.5 mb-2 ml-2 pl-2 border-l border-white/10">{group.items.map(renderItem)}</ul>}
                            </div>
                        );
                    });
                })()}
            </nav>

            {/* Collapse toggle */}
            <div className="p-4 pt-6 mt-auto relative z-10 border-t border-white/10">
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={cn(
                        "flex items-center w-full h-[48px] rounded-xl transition-all duration-300 font-semibold text-[15px]",
                        "bg-white/10 border border-white/15 hover:bg-white/20 text-white/70 hover:text-white",
                        collapsed ? "justify-center" : "px-4"
                    )}
                >
                    {collapsed ? (
                        <ChevronRight className="h-5 w-5" />
                    ) : (
                        <>
                            <ChevronLeft className="h-5 w-5 mr-3 text-white/40" />
                            <span>{language === "en" ? "Collapse Menu" : "ย่อแถบเมนู"}</span>
                        </>
                    )}
                </button>
            </div>
        </aside>
    );
}
