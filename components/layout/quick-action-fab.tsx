"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

/** ปุ่มลอย "เปิด Visit ใหม่" — กดได้จากทุกหน้า dashboard (ซ่อนในหน้าเปิด visit เอง) */
export default function QuickActionFab() {
    const pathname = usePathname();
    if (pathname?.startsWith("/dashboard/visits/new")) return null;

    return (
        <Link
            href="/dashboard/visits/new"
            className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 h-13 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#2B54F0] to-[#00A6C0] text-white text-sm font-bold shadow-xl shadow-blue-500/30 hover:scale-105 active:scale-95 transition-transform"
            title="เปิด Visit ใหม่"
        >
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">เปิด Visit ใหม่</span>
        </Link>
    );
}
