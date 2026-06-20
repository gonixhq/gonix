"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
    Clock, ShieldCheck, LogOut, RefreshCw, XCircle, Mail, Building2, BadgeCheck, Ban,
} from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของคลินิก",
    admin: "แอดมิน",
    doctor: "แพทย์",
    dentist: "ทันตแพทย์",
    nurse: "พยาบาล",
    pharmacist: "เภสัชกร",
    physio: "นักกายภาพบำบัด",
    receptionist: "เจ้าหน้าที่ต้อนรับ",
    accountant: "เจ้าหน้าที่บัญชี",
};

interface Props {
    email: string;
    fullName: string;
    requestedRole: string | null;
    status: "pending" | "rejected" | "approved" | "disabled";
    rejectedReason: string | null;
    clinicName: string | null;
    createdAt: string | null;
}

export default function PendingApprovalClient({
    email, fullName, requestedRole, status, rejectedReason, clinicName, createdAt,
}: Props) {
    const router = useRouter();
    const supabase = createClient();

    async function handleSignOut() {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    }

    function handleRefresh() {
        router.refresh();
    }

    const isRejected = status === "rejected";
    const isDisabled = status === "disabled";
    const requestedRoleLabel = requestedRole ? (ROLE_LABEL[requestedRole] || requestedRole) : "—";
    const createdAtDisplay = createdAt
        ? new Date(createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })
        : "—";

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-100 via-blue-50 to-sky-50">
            {/* Background blur orbs */}
            <div className="absolute top-20 right-20 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl pointer-events-none" />
            <div className="absolute bottom-20 left-20 h-96 w-96 rounded-full bg-blue-300/15 blur-3xl pointer-events-none" />

            <div className="w-full max-w-lg relative z-10">
                {/* Wordmark */}
                <div className="text-center mb-8">
                    <div className="font-black text-2xl tracking-tight bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 bg-clip-text text-transparent inline-block">
                        Gonix
                    </div>
                </div>

                {/* Main card */}
                <div className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-3xl shadow-xl shadow-slate-900/[0.04] p-8 sm:p-10 space-y-6">
                    {/* Icon */}
                    <div className="flex justify-center">
                        {isDisabled ? (
                            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-lg shadow-slate-700/30 ring-1 ring-white/20">
                                <Ban className="h-10 w-10 text-white" />
                            </div>
                        ) : isRejected ? (
                            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 ring-1 ring-white/20">
                                <XCircle className="h-10 w-10 text-white" />
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 ring-1 ring-white/20">
                                    <Clock className="h-10 w-10 text-white" />
                                </div>
                                <div className="absolute inset-0 rounded-2xl bg-amber-400/30 animate-ping" />
                            </div>
                        )}
                    </div>

                    {/* Headline */}
                    <div className="text-center space-y-2">
                        <h1 className="text-2xl font-bold text-slate-800">
                            {isDisabled ? "บัญชีถูกปิดใช้งาน" : isRejected ? "บัญชีของคุณถูกปฏิเสธ" : "รอแอดมินอนุมัติ"}
                        </h1>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            {isDisabled
                                ? "บัญชีของคุณถูกปิดโดยแอดมินคลินิก กรุณาติดต่อแอดมินเพื่อขอเปิดใช้งานอีกครั้ง"
                                : isRejected
                                    ? "ขอโทษด้วยครับ คำขอของคุณไม่ผ่านการอนุมัติ"
                                    : "บัญชีของคุณถูกสร้างเรียบร้อยแล้ว และอยู่ระหว่างรอการตรวจสอบจากแอดมินคลินิก"}
                        </p>
                    </div>

                    {/* Rejected reason */}
                    {isRejected && rejectedReason && (
                        <div className="rounded-xl bg-red-50/80 border border-red-200/60 p-4">
                            <div className="text-xs font-bold text-red-700 mb-1.5 uppercase tracking-wider">เหตุผล</div>
                            <p className="text-sm text-red-900/80 leading-relaxed">{rejectedReason}</p>
                        </div>
                    )}

                    {/* Info table */}
                    <div className="rounded-xl bg-slate-50/60 border border-slate-200/60 divide-y divide-slate-200/60 overflow-hidden">
                        <InfoRow icon={Mail} label="อีเมล" value={email} />
                        <InfoRow icon={BadgeCheck} label="ชื่อ-นามสกุล" value={fullName} />
                        {clinicName && <InfoRow icon={Building2} label="คลินิก" value={clinicName} />}
                        <InfoRow icon={ShieldCheck} label="ตำแหน่งที่ขอ" value={requestedRoleLabel} />
                        <InfoRow icon={Clock} label="วันที่ส่งคำขอ" value={createdAtDisplay} />
                    </div>

                    {/* Help box */}
                    {!isRejected && (
                        <div className="rounded-xl bg-blue-50/60 border border-blue-100/60 p-4">
                            <p className="text-xs text-blue-900/70 leading-relaxed">
                                💡 <strong>ติดต่อแอดมิน:</strong> ถ้ารอนาน กรุณาแจ้งเจ้าของคลินิก/แอดมิน
                                ว่าคุณส่งคำขอด้วยอีเมล <strong>{email}</strong> เพื่อให้รีบตรวจสอบ
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        {!isRejected && !isDisabled && (
                            <Button
                                onClick={handleRefresh}
                                variant="outline"
                                className="flex-1 rounded-xl gap-2 bg-white/60 hover:bg-white border-slate-200"
                            >
                                <RefreshCw className="h-4 w-4" />
                                เช็คอีกครั้ง
                            </Button>
                        )}
                        <Button
                            onClick={handleSignOut}
                            className={`${(isRejected || isDisabled) ? "w-full" : "flex-1"} rounded-xl gap-2 bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 text-white shadow-lg shadow-slate-900/25 hover:shadow-xl ring-1 ring-white/10`}
                        >
                            <LogOut className="h-4 w-4" />
                            ออกจากระบบ
                        </Button>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-[11px] text-slate-400/80 mt-6 flex items-center justify-center gap-1.5">
                    <ShieldCheck className="h-3 w-3" />
                    Protected by Supabase RLS & end-to-end encryption
                </p>
            </div>
        </div>
    );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <Icon className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="text-xs font-semibold text-slate-500 w-28 shrink-0">{label}</div>
            <div className="text-sm text-slate-800 font-medium truncate flex-1">{value}</div>
        </div>
    );
}
