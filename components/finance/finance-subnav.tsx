"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// แถบเมนูย่อยการเงิน — โชว์บนหน้าการเงินหลัก + หน้าย่อย (มีปุ่มกลับ) · ไม่โชว์บนหน้ารายละเอียดใบเสร็จ
const LINKS: { href: string; label: string; perm: "reports" | "commission" }[] = [
    { href: "/dashboard/finance/monthly-report", label: "รายงานกำไรรายเดือน", perm: "reports" },
    { href: "/dashboard/finance/payables", label: "บิลค้างจ่าย", perm: "reports" },
    { href: "/dashboard/finance/fixed-costs", label: "ต้นทุนคงที่", perm: "reports" },
    { href: "/dashboard/finance/procedure-costs", label: "ต้นทุน & มาร์จิ้นหัตถการ", perm: "reports" },
    { href: "/dashboard/finance/team-commission", label: "คอมทีม", perm: "commission" },
    { href: "/dashboard/finance/card-fees", label: "ค่าธรรมเนียมบัตร", perm: "reports" },
];

export default function FinanceSubnav({ canReports, canCommission }: { canReports: boolean; canCommission: boolean }) {
    const pathname = usePathname() || "";
    const links = LINKS.filter(l => (l.perm === "reports" ? canReports : canCommission));
    const isRoot = pathname === "/dashboard/finance";
    const inSub = links.some(l => pathname === l.href || pathname.startsWith(l.href + "/"));
    if ((!isRoot && !inSub) || links.length === 0) return null;
    return (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-4 print:hidden">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {!isRoot && (
                    <Link href="/dashboard/finance" className="shrink-0 h-9 px-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50">
                        <ArrowLeft className="h-4 w-4" /> การเงิน
                    </Link>
                )}
                {links.map(l => {
                    const active = pathname === l.href || pathname.startsWith(l.href + "/");
                    return (
                        <Link key={l.href} href={l.href}
                            className={`shrink-0 h-9 px-3 rounded-xl text-sm inline-flex items-center border transition-colors ${active ? "bg-violet-600 border-violet-600 text-white font-semibold" : "bg-white/70 border-slate-200 text-slate-600 hover:bg-white"}`}>
                            {l.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
