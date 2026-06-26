"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HandCoins, UserPlus, Gift } from "lucide-react";

const TABS = [
    { href: "/dashboard/commissions", label: "พนักงาน (DF/Comm)", Icon: HandCoins },
    { href: "/dashboard/affiliates", label: "เซลล์ฟรีแลนซ์", Icon: UserPlus },
    { href: "/dashboard/referrals", label: "Referral ลูกค้า", Icon: Gift },
];

/** แท็บสลับมุมมองรายได้ Performance — พนักงาน / affiliate / referral */
export default function RewardsTabs() {
    const pathname = usePathname();
    return (
        <div className="inline-flex items-center gap-1 rounded-2xl bg-white/70 border border-slate-200/70 p-1 backdrop-blur flex-wrap">
            {TABS.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                    <Link key={href} href={href}
                        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold transition-all ${active ? "bg-[#2B54F0] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>
                        <Icon className="h-3.5 w-3.5" /> {label}
                    </Link>
                );
            })}
        </div>
    );
}
