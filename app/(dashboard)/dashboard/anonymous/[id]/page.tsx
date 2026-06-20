import { gatePermission } from "@/lib/auth/guard";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import Link from "next/link";
import { getAnonCase, getLabServices } from "@/lib/actions/anonymous";
import AnonCaseClient from "./anon-case-client";

export const dynamic = "force-dynamic";

export default async function AnonCasePage({ params }: { params: Promise<{ id: string }> }) {
    await gatePermission("anon.view");
    const { id } = await params;
    const [data, services, { permissions }] = await Promise.all([
        getAnonCase(id), getLabServices(), getEffectivePermissionsForUser(),
    ]);
    const perms = {
        clinical: permissions["anon.clinical"] === true,
        result: permissions["anon.result"] === true,
        manage: permissions["anon.manage"] === true,
    };

    if (!data) {
        return (
            <div className="max-w-md mx-auto text-center py-20">
                <p className="text-slate-500 mb-3">ไม่พบเคสนิรนามนี้</p>
                <Link href="/dashboard/anonymous" className="text-[#2B54F0] font-semibold text-sm">← กลับรายการ</Link>
            </div>
        );
    }

    // กันการเข้าถึงเคสที่ลงทะเบียนออนไลน์แต่ยังไม่ได้ "เปิดเคส" ด้วยรหัส
    if (data.status === "registered") {
        return (
            <div className="max-w-md mx-auto text-center py-20 px-4">
                <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">🔒</span>
                </div>
                <h1 className="text-lg font-bold text-slate-800 mb-1">เคสนี้ยังไม่ถูกเปิด</h1>
                <p className="text-sm text-slate-500 mb-4">
                    เคสที่ลงทะเบียนออนไลน์ต้องให้ผู้รับบริการแจ้ง <b>รหัสยืนยัน</b> แล้วเปิดเคสที่หน้าคลินิกนิรนามก่อน จึงจะเข้าถึงข้อมูลได้
                </p>
                <Link href="/dashboard/anonymous" className="inline-flex items-center h-10 px-4 rounded-xl bg-[#2B54F0] text-white font-semibold text-sm">
                    ← ไปหน้าเปิดเคสด้วยรหัส
                </Link>
            </div>
        );
    }

    return <AnonCaseClient data={data} services={services} perms={perms} />;
}
