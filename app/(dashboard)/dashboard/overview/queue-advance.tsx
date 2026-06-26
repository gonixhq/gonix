"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { updateVisitStatus } from "@/lib/actions/visits";

// ขั้นถัดไปของแต่ละสถานะ (forward เท่านั้น — กันกดข้ามผิด)
const NEXT: Record<string, { status: string; label: string }> = {
    waiting: { status: "triaged", label: "ซักประวัติเสร็จ" },
    triaged: { status: "with_doctor", label: "เข้าตรวจ" },
    with_nurse: { status: "with_doctor", label: "เข้าตรวจ" },
    with_doctor: { status: "waiting_payment", label: "ส่งชำระเงิน" },
    waiting_medicine: { status: "waiting_payment", label: "ส่งชำระเงิน" },
    waiting_payment: { status: "completed", label: "เสร็จสิ้น" },
};

/** ปุ่มเลื่อนสถานะคิวขั้นถัดไป จากหน้า Dashboard (inline action) */
export function QueueAdvance({ vn, status }: { vn: string; status: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const next = NEXT[status];
    if (!next) return null;

    return (
        <button
            type="button"
            onClick={() =>
                start(async () => {
                    try {
                        await updateVisitStatus(vn, next.status);
                        router.refresh();
                    } catch {
                        /* เงียบ — ปล่อยให้ refresh รอบหน้าแก้ */
                    }
                })
            }
            disabled={pending}
            title={`เปลี่ยนสถานะเป็น: ${next.label}`}
            className="shrink-0 inline-flex items-center gap-0.5 h-7 px-2 rounded-lg text-[11px] font-bold bg-[#2B54F0]/10 text-[#2B54F0] hover:bg-[#2B54F0] hover:text-white transition-colors disabled:opacity-50"
        >
            {pending ? "..." : <>{next.label}<ChevronRight className="h-3 w-3" /></>}
        </button>
    );
}
