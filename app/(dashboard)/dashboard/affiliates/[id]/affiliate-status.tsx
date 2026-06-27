"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Loader2 } from "lucide-react";
import { updateAffiliate } from "@/lib/actions/affiliates";

export default function AffiliateStatusToggle({ affiliateId, isActive }: { affiliateId: string; isActive: boolean }) {
    const router = useRouter();
    const [pending, start] = useTransition();

    function toggle() {
        const turningOff = isActive;
        const msg = turningOff
            ? "ปิดใช้งานเซลล์รายนี้?\nจะใช้รหัสแนะนำกับลูกค้าใหม่ไม่ได้ แต่ยอด/ประวัติเดิมยังอยู่ครบ"
            : "เปิดใช้งานเซลล์รายนี้อีกครั้ง?";
        if (!confirm(msg)) return;
        start(async () => {
            const r = await updateAffiliate(affiliateId, { is_active: !isActive });
            if (!r.success) alert(r.error || "ทำรายการไม่สำเร็จ");
            router.refresh();
        });
    }

    return isActive ? (
        <button onClick={toggle} disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-sm font-bold hover:bg-rose-100 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} ปิดใช้งานเซลล์
        </button>
    ) : (
        <button onClick={toggle} disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} เปิดใช้งานอีกครั้ง
        </button>
    );
}
