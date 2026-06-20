"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    UserCog, Clock, CheckCircle2, XCircle, X, Loader2, Phone, ShieldCheck,
    Users, Settings2, AlertTriangle, PencilLine, Power, RefreshCw,
    Crown,
} from "lucide-react";
import {
    approveStaff, rejectStaff, changeStaffRole, toggleStaffActive, reapproveStaff,
} from "@/lib/actions/staff";
import { saveRolePermissions, resetRolePermissions } from "@/lib/actions/permissions";
import {
    PERMISSION_GROUPS, isDefaultAllowed, type StaffRole,
} from "@/lib/permissions";

export interface PendingProfile {
    id: string;
    full_name: string;
    phone: string | null;
    requested_role: string | null;
    created_at: string;
}

export interface StaffProfile {
    id: string;
    full_name: string;
    phone: string | null;
    role: string;
    approval_status: "pending" | "approved" | "rejected";
    is_active: boolean;
    last_seen_at: string | null;
    created_at: string;
    rejected_reason: string | null;
    approved_at: string | null;
    is_me: boolean;
}

export interface PermissionOverride {
    role: string;
    permission_key: string;
    is_allowed: boolean;
}

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

const ROLE_COLOR: Record<string, string> = {
    owner: "bg-purple-100 text-purple-700",
    admin: "bg-indigo-100 text-indigo-700",
    doctor: "bg-blue-100 text-blue-700",
    dentist: "bg-cyan-100 text-cyan-700",
    nurse: "bg-emerald-100 text-emerald-700",
    pharmacist: "bg-blue-100 text-blue-700",
    physio: "bg-cyan-100 text-cyan-700",
    receptionist: "bg-amber-100 text-amber-700",
    accountant: "bg-orange-100 text-orange-700",
};

const ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

type ModalState =
    | { type: "approve"; profile: PendingProfile }
    | { type: "reject"; profile: PendingProfile }
    | { type: "edit_role"; staff: StaffProfile }
    | { type: "toggle_active"; staff: StaffProfile; nextActive: boolean }
    | { type: "reapprove"; staff: StaffProfile }
    | null;

export default function StaffClient({
    pending,
    staff,
    overrides,
}: {
    pending: PendingProfile[];
    staff: StaffProfile[];
    overrides: PermissionOverride[];
}) {
    const [modal, setModal] = useState<ModalState>(null);

    const approvedStaff = staff.filter((s) => s.approval_status === "approved");
    const rejectedStaff = staff.filter((s) => s.approval_status === "rejected");

    return (
        <div className="space-y-5 animate-fade-in max-w-6xl mx-auto">
            {/* Sub-header — compact (Top Navbar shows page title) */}
            <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap pt-1">
                <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                    <UserCog className="h-4 w-4" />
                    จัดการพนักงาน
                </span>
                <span className="text-slate-300">·</span>
                <span>อนุมัติคำขอ · กำหนดสิทธิ์ · เปิด/ปิดบัญชี</span>
            </p>

            <Tabs defaultValue={pending.length > 0 ? "pending" : "active"} className="space-y-6">
                <TabsList className="bg-white/70 backdrop-blur-md border border-white/80 shadow-sm h-12 p-1.5 rounded-2xl gap-1">
                    <TabsTrigger value="pending" className="rounded-xl px-5 py-2 gap-2 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <Clock className="h-4 w-4" />
                        รออนุมัติ
                        {pending.length > 0 && (
                            <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                                {pending.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="active" className="rounded-xl px-5 py-2 gap-2 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <Users className="h-4 w-4" />
                        พนักงานปัจจุบัน
                        {approvedStaff.length > 0 && (
                            <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center data-[state=active]:bg-white/25 data-[state=active]:text-white">
                                {approvedStaff.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="permissions" className="rounded-xl px-5 py-2 gap-2 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <Settings2 className="h-4 w-4" />
                        สิทธิ์ตาม Role
                    </TabsTrigger>
                </TabsList>

                {/* ══ Tab 1: Pending ══ */}
                <TabsContent value="pending" className="space-y-4">
                    {pending.length === 0 ? (
                        <Card className="rounded-2xl border-dashed border-2">
                            <CardContent className="p-12 text-center">
                                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
                                <h3 className="font-semibold text-slate-700 mb-1">ไม่มีคำขอรออนุมัติ</h3>
                                <p className="text-sm text-slate-500">ตอนนี้ทุกคนได้รับการอนุมัติเรียบร้อยแล้ว</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="rounded-xl bg-amber-50/60 border border-amber-200/60 p-4 flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-sm text-amber-900/80 leading-relaxed">
                                    มีคำขอ <strong>{pending.length} คน</strong> รอการอนุมัติ — กรุณาตรวจสอบและกำหนด role ที่ถูกต้องก่อนอนุมัติ
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {pending.map((p) => (
                                    <PendingCard
                                        key={p.id}
                                        profile={p}
                                        onApprove={() => setModal({ type: "approve", profile: p })}
                                        onReject={() => setModal({ type: "reject", profile: p })}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </TabsContent>

                {/* ══ Tab 2: Active staff ══ */}
                <TabsContent value="active" className="space-y-4">
                    {approvedStaff.length === 0 ? (
                        <Card className="rounded-2xl border-dashed border-2">
                            <CardContent className="p-12 text-center">
                                <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                <h3 className="font-semibold text-slate-700 mb-1">ยังไม่มีพนักงาน</h3>
                                <p className="text-sm text-slate-500">พนักงานที่ผ่านการอนุมัติจะแสดงที่นี่</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="gonix-card-premium overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/80 border-b border-slate-200/60">
                                        <tr>
                                            <th className="px-5 py-3.5 text-left font-semibold text-slate-600">พนักงาน</th>
                                            <th className="px-5 py-3.5 text-left font-semibold text-slate-600">Role</th>
                                            <th className="px-5 py-3.5 text-left font-semibold text-slate-600">เบอร์โทร</th>
                                            <th className="px-5 py-3.5 text-center font-semibold text-slate-600">สถานะ</th>
                                            <th className="px-5 py-3.5 text-right font-semibold text-slate-600">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {approvedStaff.map((s) => (
                                            <StaffRow
                                                key={s.id}
                                                staff={s}
                                                onEditRole={() => setModal({ type: "edit_role", staff: s })}
                                                onToggleActive={() => setModal({ type: "toggle_active", staff: s, nextActive: !s.is_active })}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Rejected section */}
                    {rejectedStaff.length > 0 && (
                        <div className="space-y-3 pt-4">
                            <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                <h3 className="text-sm font-bold text-slate-700">คำขอที่ถูกปฏิเสธ ({rejectedStaff.length})</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {rejectedStaff.map((s) => (
                                    <RejectedCard
                                        key={s.id}
                                        staff={s}
                                        onReapprove={() => setModal({ type: "reapprove", staff: s })}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="permissions">
                    <PermissionEditor overrides={overrides} />
                </TabsContent>
            </Tabs>

            {/* Modals */}
            {modal?.type === "approve" && <ApproveModal profile={modal.profile} onClose={() => setModal(null)} />}
            {modal?.type === "reject" && <RejectModal profile={modal.profile} onClose={() => setModal(null)} />}
            {modal?.type === "edit_role" && <EditRoleModal staff={modal.staff} onClose={() => setModal(null)} />}
            {modal?.type === "toggle_active" && (
                <ToggleActiveModal staff={modal.staff} nextActive={modal.nextActive} onClose={() => setModal(null)} />
            )}
            {modal?.type === "reapprove" && <ReapproveModal staff={modal.staff} onClose={() => setModal(null)} />}
        </div>
    );
}

/* ─── Pending Card (เหมือนเดิม) ─── */
function PendingCard({
    profile, onApprove, onReject,
}: {
    profile: PendingProfile;
    onApprove: () => void;
    onReject: () => void;
}) {
    const requestedLabel = profile.requested_role ? (ROLE_LABEL[profile.requested_role] || profile.requested_role) : "—";
    const initials = profile.full_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-start gap-4 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-md shadow-blue-500/20 shrink-0">
                    {initials || "?"}
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-800 truncate">{profile.full_name}</h3>
                    <Badge variant="secondary" className="mt-1 text-xs bg-amber-100 text-amber-700 border-0">
                        <Clock className="h-3 w-3 mr-1" /> รออนุมัติ
                    </Badge>
                </div>
            </div>
            <div className="space-y-2 mb-5 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-500">ตำแหน่งที่ขอ:</span>
                    <span className="font-semibold text-slate-700">{requestedLabel}</span>
                </div>
                {profile.phone && (
                    <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs">{profile.phone}</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-slate-500">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs">
                        ส่งคำขอเมื่อ {new Date(profile.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                </div>
            </div>
            <div className="flex gap-2">
                <Button onClick={onApprove} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white gap-2 shadow-sm">
                    <CheckCircle2 className="h-4 w-4" /> อนุมัติ
                </Button>
                <Button onClick={onReject} variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-2">
                    <XCircle className="h-4 w-4" /> ปฏิเสธ
                </Button>
            </div>
        </div>
    );
}

/* ─── Staff Row (Tab 2) ─── */
function StaffRow({
    staff, onEditRole, onToggleActive,
}: {
    staff: StaffProfile;
    onEditRole: () => void;
    onToggleActive: () => void;
}) {
    const initials = staff.full_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    const roleColor = ROLE_COLOR[staff.role] || "bg-slate-100 text-slate-700";
    const roleLabel = ROLE_LABEL[staff.role] || staff.role;
    const isOwnerRole = staff.role === "owner";

    return (
        <tr className="border-b last:border-0 border-slate-100/80 hover:bg-slate-50/50 transition-colors">
            <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-xs tracking-wider shrink-0 ${
                        staff.is_active
                            ? "bg-gradient-to-br from-blue-500 to-cyan-600 shadow-sm shadow-blue-500/20"
                            : "bg-slate-300"
                    }`}>
                        {initials || "?"}
                    </div>
                    <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                            {staff.full_name}
                            {staff.is_me && (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">YOU</span>
                            )}
                            {isOwnerRole && (
                                <Crown className="h-3.5 w-3.5 text-amber-500" />
                            )}
                        </div>
                        <div className="text-xs text-slate-400">
                            สมัครเมื่อ {new Date(staff.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                    </div>
                </div>
            </td>
            <td className="px-5 py-3.5">
                <Badge variant="secondary" className={`text-xs border-0 ${roleColor}`}>
                    {roleLabel}
                </Badge>
            </td>
            <td className="px-5 py-3.5 text-slate-600 text-xs">
                {staff.phone || <span className="text-slate-300">—</span>}
            </td>
            <td className="px-5 py-3.5 text-center">
                {staff.is_active ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        เปิดใช้งาน
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        ปิดบัญชี
                    </span>
                )}
            </td>
            <td className="px-5 py-3.5 text-right">
                <div className="flex justify-end gap-1.5">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onEditRole}
                        disabled={staff.is_me}
                        className="rounded-lg h-8 px-2 text-xs gap-1.5 text-slate-600 hover:text-slate-800 disabled:opacity-30"
                        title={staff.is_me ? "ไม่สามารถแก้ role ของตัวเอง" : "เปลี่ยน role"}
                    >
                        <PencilLine className="h-3.5 w-3.5" />
                        Role
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onToggleActive}
                        disabled={staff.is_me}
                        className={`rounded-lg h-8 px-2 text-xs gap-1.5 disabled:opacity-30 ${
                            staff.is_active
                                ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        }`}
                        title={staff.is_me ? "ไม่สามารถปิดบัญชีตัวเอง" : staff.is_active ? "ปิดบัญชี" : "เปิดบัญชี"}
                    >
                        <Power className="h-3.5 w-3.5" />
                        {staff.is_active ? "ปิด" : "เปิด"}
                    </Button>
                </div>
            </td>
        </tr>
    );
}

/* ─── Rejected Card ─── */
function RejectedCard({
    staff, onReapprove,
}: {
    staff: StaffProfile;
    onReapprove: () => void;
}) {
    const initials = staff.full_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    return (
        <div className="rounded-2xl bg-red-50/40 border border-red-200/60 p-4">
            <div className="flex items-start gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-red-200/60 text-red-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {initials || "?"}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 truncate">{staff.full_name}</div>
                    <Badge className="mt-1 text-xs bg-red-100 text-red-700 border-0">
                        <XCircle className="h-3 w-3 mr-1" /> ถูกปฏิเสธ
                    </Badge>
                </div>
            </div>
            {staff.rejected_reason && (
                <div className="text-xs text-red-900/70 bg-white/60 rounded-lg p-2.5 mb-3 leading-relaxed">
                    <strong className="text-red-700">เหตุผล:</strong> {staff.rejected_reason}
                </div>
            )}
            <Button
                onClick={onReapprove}
                size="sm"
                variant="outline"
                className="w-full rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-2"
            >
                <RefreshCw className="h-3.5 w-3.5" /> อนุมัติใหม่
            </Button>
        </div>
    );
}

/* ─── Approve Modal ─── */
function ApproveModal({ profile, onClose }: { profile: PendingProfile; onClose: () => void }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [finalRole, setFinalRole] = useState(profile.requested_role || "nurse");

    function handle() {
        setError("");
        startTransition(async () => {
            const res = await approveStaff(profile.id, finalRole as never);
            if (!res.success) setError(res.error || "เกิดข้อผิดพลาด");
            else { onClose(); router.refresh(); }
        });
    }

    return (
        <ModalShell onClose={onClose} title="อนุมัติพนักงาน" icon={CheckCircle2} accent="emerald">
            <p className="text-sm text-slate-600 mb-4">
                กำหนด role สุดท้ายให้ <strong className="text-slate-800">{profile.full_name}</strong> ก่อนอนุมัติ
            </p>
            {error && <ErrorBox text={error} />}
            <RoleSelect value={finalRole} onChange={setFinalRole} />
            {profile.requested_role && profile.requested_role !== finalRole && (
                <p className="text-xs text-amber-600 mt-1">⚠️ ต่างจากที่ผู้สมัครขอไว้ ({ROLE_LABEL[profile.requested_role]})</p>
            )}
            <ModalActions onClose={onClose} onConfirm={handle} pending={pending} accent="emerald" confirmText="ยืนยันอนุมัติ" Icon={CheckCircle2} />
        </ModalShell>
    );
}

/* ─── Reject Modal ─── */
function RejectModal({ profile, onClose }: { profile: PendingProfile; onClose: () => void }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [reason, setReason] = useState("");

    function handle() {
        setError("");
        if (reason.trim().length < 3) { setError("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร"); return; }
        startTransition(async () => {
            const res = await rejectStaff(profile.id, reason);
            if (!res.success) setError(res.error || "เกิดข้อผิดพลาด");
            else { onClose(); router.refresh(); }
        });
    }

    return (
        <ModalShell onClose={onClose} title="ปฏิเสธคำขอ" icon={XCircle} accent="red">
            <p className="text-sm text-slate-600 mb-4">
                คุณกำลังปฏิเสธคำขอของ <strong className="text-slate-800">{profile.full_name}</strong>
            </p>
            {error && <ErrorBox text={error} />}
            <Label className="text-sm font-semibold text-slate-700">เหตุผล <span className="text-red-500">*</span></Label>
            <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="เช่น ไม่ใช่พนักงานในคลินิกนี้ / รออีกครั้งหลังเริ่มงาน"
                className="rounded-xl mt-1.5"
            />
            <ModalActions onClose={onClose} onConfirm={handle} pending={pending} accent="red" confirmText="ยืนยันปฏิเสธ" Icon={XCircle} />
        </ModalShell>
    );
}

/* ─── Edit Role Modal ─── */
function EditRoleModal({ staff, onClose }: { staff: StaffProfile; onClose: () => void }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [newRole, setNewRole] = useState(staff.role);

    function handle() {
        setError("");
        if (newRole === staff.role) { onClose(); return; }
        startTransition(async () => {
            const res = await changeStaffRole(staff.id, newRole as never);
            if (!res.success) setError(res.error || "เกิดข้อผิดพลาด");
            else { onClose(); router.refresh(); }
        });
    }

    return (
        <ModalShell onClose={onClose} title="เปลี่ยน Role" icon={PencilLine} accent="blue">
            <p className="text-sm text-slate-600 mb-4">
                เปลี่ยน role ของ <strong className="text-slate-800">{staff.full_name}</strong>
            </p>
            {error && <ErrorBox text={error} />}
            <div className="flex items-center gap-3 mb-4 text-xs">
                <span className="text-slate-500">ปัจจุบัน:</span>
                <Badge variant="secondary" className={`text-xs border-0 ${ROLE_COLOR[staff.role] || "bg-slate-100 text-slate-700"}`}>
                    {ROLE_LABEL[staff.role] || staff.role}
                </Badge>
            </div>
            <RoleSelect value={newRole} onChange={setNewRole} label="Role ใหม่" />
            <ModalActions onClose={onClose} onConfirm={handle} pending={pending} accent="blue" confirmText="บันทึก" Icon={PencilLine} />
        </ModalShell>
    );
}

/* ─── Toggle Active Modal ─── */
function ToggleActiveModal({
    staff, nextActive, onClose,
}: {
    staff: StaffProfile;
    nextActive: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");

    function handle() {
        setError("");
        startTransition(async () => {
            const res = await toggleStaffActive(staff.id, nextActive);
            if (!res.success) setError(res.error || "เกิดข้อผิดพลาด");
            else { onClose(); router.refresh(); }
        });
    }

    const accent = nextActive ? "emerald" : "red";
    const action = nextActive ? "เปิดบัญชี" : "ปิดบัญชี";

    return (
        <ModalShell onClose={onClose} title={action} icon={Power} accent={accent}>
            <p className="text-sm text-slate-600 mb-4">
                {nextActive
                    ? <>คุณแน่ใจหรือไม่ว่าจะ <strong className="text-emerald-700">เปิดบัญชี</strong> ของ <strong>{staff.full_name}</strong>?</>
                    : <>คุณแน่ใจหรือไม่ว่าจะ <strong className="text-red-600">ปิดบัญชี</strong> ของ <strong>{staff.full_name}</strong>? — ผู้ใช้จะไม่สามารถใช้งานระบบได้</>
                }
            </p>
            {error && <ErrorBox text={error} />}
            <ModalActions onClose={onClose} onConfirm={handle} pending={pending} accent={accent} confirmText={`ยืนยัน${action}`} Icon={Power} />
        </ModalShell>
    );
}

/* ─── Re-approve Modal (rejected → approved) ─── */
function ReapproveModal({ staff, onClose }: { staff: StaffProfile; onClose: () => void }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [newRole, setNewRole] = useState(staff.role || "nurse");

    function handle() {
        setError("");
        startTransition(async () => {
            const res = await reapproveStaff(staff.id, newRole as never);
            if (!res.success) setError(res.error || "เกิดข้อผิดพลาด");
            else { onClose(); router.refresh(); }
        });
    }

    return (
        <ModalShell onClose={onClose} title="อนุมัติใหม่" icon={RefreshCw} accent="emerald">
            <p className="text-sm text-slate-600 mb-4">
                อนุมัติ <strong className="text-slate-800">{staff.full_name}</strong> ที่เคยถูกปฏิเสธ
            </p>
            {error && <ErrorBox text={error} />}
            <RoleSelect value={newRole} onChange={setNewRole} />
            <ModalActions onClose={onClose} onConfirm={handle} pending={pending} accent="emerald" confirmText="อนุมัติใหม่" Icon={CheckCircle2} />
        </ModalShell>
    );
}

/* ═══════════ Shared sub-components ═══════════ */

function RoleSelect({ value, onChange, label = "Role" }: { value: string; onChange: (v: string) => void; label?: string }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-700">{label}</Label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
            >
                {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                ))}
            </select>
        </div>
    );
}

function ErrorBox({ text }: { text: string }) {
    return (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
            {text}
        </div>
    );
}

function ModalActions({
    onClose, onConfirm, pending, accent, confirmText, Icon,
}: {
    onClose: () => void;
    onConfirm: () => void;
    pending: boolean;
    accent: "emerald" | "red" | "blue";
    confirmText: string;
    Icon: React.ElementType;
}) {
    const colorMap = {
        emerald: "from-emerald-500 to-emerald-600",
        red: "from-red-500 to-red-600",
        blue: "from-blue-600 to-blue-700",
    };
    return (
        <div className="flex justify-end gap-3 pt-5">
            <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">
                ยกเลิก
            </Button>
            <Button
                onClick={onConfirm}
                disabled={pending}
                className={`rounded-xl bg-gradient-to-r ${colorMap[accent]} text-white shadow-sm gap-2`}
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                {confirmText}
            </Button>
        </div>
    );
}

/* ═══════════ Permission Editor (Tab 3) ═══════════ */

function PermissionEditor({ overrides }: { overrides: PermissionOverride[] }) {
    const router = useRouter();
    const [selectedRole, setSelectedRole] = useState<StaffRole>("doctor");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [savedFlash, setSavedFlash] = useState(false);

    // Build initial map = defaults + DB overrides for selectedRole
    const buildInitialMap = (role: StaffRole) => {
        const map: Record<string, boolean> = {};
        for (const group of PERMISSION_GROUPS) {
            for (const perm of group.permissions) {
                map[perm.key] = isDefaultAllowed(role, perm.key);
            }
        }
        for (const o of overrides) {
            if (o.role === role) map[o.permission_key] = o.is_allowed;
        }
        return map;
    };

    const [permMap, setPermMap] = useState<Record<string, boolean>>(() => buildInitialMap("doctor"));
    const [dirty, setDirty] = useState(false);

    function handleRoleChange(role: StaffRole) {
        if (dirty && !confirm("คุณยังไม่ได้บันทึก การเปลี่ยน Role จะทำให้การแก้ไขหายไป — ดำเนินการต่อ?")) return;
        setSelectedRole(role);
        setPermMap(buildInitialMap(role));
        setDirty(false);
        setError("");
    }

    function togglePermission(key: string) {
        setPermMap((m) => ({ ...m, [key]: !m[key] }));
        setDirty(true);
    }

    function handleSave() {
        setError("");
        startTransition(async () => {
            const res = await saveRolePermissions(selectedRole, permMap);
            if (!res.success) {
                setError(res.error || "บันทึกไม่สำเร็จ");
            } else {
                setDirty(false);
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 2000);
                router.refresh();
            }
        });
    }

    function handleReset() {
        if (!confirm(`รีเซ็ตสิทธิ์ของ "${ROLE_LABEL[selectedRole]}" กลับเป็นค่าเริ่มต้น?`)) return;
        setError("");
        startTransition(async () => {
            const res = await resetRolePermissions(selectedRole);
            if (!res.success) {
                setError(res.error || "รีเซ็ตไม่สำเร็จ");
            } else {
                setPermMap(buildInitialMap(selectedRole));
                setDirty(false);
                router.refresh();
            }
        });
    }

    const isOwnerOrAdmin = selectedRole === "owner" || selectedRole === "admin";

    return (
        <div className="space-y-5">
            {/* Header bar — role picker + save */}
            <div className="gonix-card-premium p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-3">
                    <Label className="text-sm font-semibold text-slate-700 shrink-0">เลือก Role:</Label>
                    <select
                        value={selectedRole}
                        onChange={(e) => handleRoleChange(e.target.value as StaffRole)}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 min-w-[200px]"
                    >
                        {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </select>
                    <Badge variant="secondary" className={`text-xs border-0 ${ROLE_COLOR[selectedRole] || "bg-slate-100"}`}>
                        {ROLE_LABEL[selectedRole]}
                    </Badge>
                </div>

                <div className="flex items-center gap-2">
                    {savedFlash && (
                        <span className="text-xs text-emerald-700 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" /> บันทึกแล้ว
                        </span>
                    )}
                    <Button
                        variant="outline"
                        onClick={handleReset}
                        disabled={pending}
                        className="rounded-xl gap-2 text-slate-600"
                        title="คืนค่าเริ่มต้น (ลบทุก override)"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        ค่าเริ่มต้น
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={pending || !dirty}
                        className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-md shadow-blue-500/25 gap-2"
                    >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        บันทึก
                    </Button>
                </div>
            </div>

            {isOwnerOrAdmin && (
                <div className="rounded-xl bg-purple-50/60 border border-purple-200/60 p-4 flex items-start gap-3">
                    <Crown className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-purple-900/80 leading-relaxed">
                        <strong>หมายเหตุ:</strong> Role <strong>{ROLE_LABEL[selectedRole]}</strong> ตามค่าเริ่มต้นมีสิทธิ์ทั้งหมด —
                        การปิดสิทธิ์อาจทำให้ระบบทำงานผิดปกติ ใช้ด้วยความระมัดระวัง
                    </p>
                </div>
            )}

            {error && <ErrorBox text={error} />}

            {/* Permission groups grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {PERMISSION_GROUPS.map((group) => {
                    const allowedCount = group.permissions.filter((p) => permMap[p.key]).length;
                    return (
                        <div key={group.id} className="gonix-card-premium overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-200/60 bg-slate-50/40 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-700">{group.label}</h3>
                                <span className="text-xs text-slate-500 font-mono">
                                    {allowedCount}/{group.permissions.length}
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {group.permissions.map((perm) => {
                                    const isAllowed = permMap[perm.key] ?? false;
                                    const isDefault = isDefaultAllowed(selectedRole, perm.key);
                                    const isOverride = isAllowed !== isDefault;
                                    return (
                                        <label
                                            key={perm.key}
                                            className={`flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/60 cursor-pointer transition-colors ${
                                                isAllowed ? "" : "opacity-60"
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-slate-800 flex items-center gap-2">
                                                    {perm.label}
                                                    {isOverride && (
                                                        <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                            แก้ไข
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-mono mt-0.5">{perm.key}</div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={isAllowed}
                                                onChange={() => togglePermission(perm.key)}
                                                className="h-5 w-5 rounded border-slate-300 text-blue-700 focus:ring-blue-500 cursor-pointer shrink-0"
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {dirty && (
                <div className="sticky bottom-4 z-30">
                    <div className="rounded-2xl bg-amber-50/95 backdrop-blur-md border border-amber-200 px-5 py-3 flex items-center justify-between shadow-lg shadow-amber-500/10">
                        <div className="flex items-center gap-2 text-sm text-amber-900">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <span>คุณยังไม่ได้บันทึกการเปลี่ยนแปลง</span>
                        </div>
                        <Button
                            onClick={handleSave}
                            disabled={pending}
                            size="sm"
                            className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white gap-2 shadow-sm shadow-blue-500/25"
                        >
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            บันทึก
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ModalShell({
    children, onClose, title, icon: Icon, accent,
}: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
    icon: React.ElementType;
    accent: "emerald" | "red" | "blue";
}) {
    const colors = {
        emerald: "from-emerald-500 to-emerald-600 shadow-emerald-500/25",
        red: "from-red-500 to-red-600 shadow-red-500/25",
        blue: "from-blue-500 to-blue-700 shadow-blue-500/25",
    }[accent];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/30 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div
                className="gonix-glass rounded-3xl max-w-md w-full overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/40 bg-white/30">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${colors} flex items-center justify-center shadow-md`}>
                            <Icon className="h-4 w-4 text-white" />
                        </div>
                        {title}
                    </h2>
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-lg hover:bg-white/60">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}
