"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    Wallet, Calendar, Printer, CheckCircle, Loader2, X, FileText,
    User, Stethoscope, Heart, ChevronLeft, ChevronRight, Trash2,
} from "lucide-react";
import { recordCommissionPayout, deleteCommissionPayout, type StaffCommissionSummary } from "@/lib/actions/commissions";

const ROLE_LABEL: Record<string, string> = {
    doctor: "แพทย์",
    nurse: "พยาบาล",
    assistant: "ผู้ช่วย",
    sales: "เซลล์",
    other: "อื่นๆ",
};

const ROLE_COLOR: Record<string, string> = {
    doctor: "bg-cyan-100 text-cyan-700 border-cyan-200",
    nurse: "bg-rose-100 text-rose-700 border-rose-200",
    assistant: "bg-amber-100 text-amber-700 border-amber-200",
    sales: "bg-emerald-100 text-emerald-700 border-emerald-200",
    other: "bg-slate-100 text-slate-700 border-slate-200",
};

const ROLE_ICON: Record<string, React.ElementType> = {
    doctor: Stethoscope,
    nurse: Heart,
    assistant: User,
    sales: User,
    other: User,
};

function formatMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString("th-TH", { year: "numeric", month: "long" });
}

function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CommissionsClient({
    commissions, month,
}: {
    commissions: StaffCommissionSummary[];
    month: string;
}) {
    const router = useRouter();
    const [payoutTarget, setPayoutTarget] = useState<StaffCommissionSummary | null>(null);

    const totalAll = commissions.reduce((s, c) => s + c.total_amount, 0);
    const totalPaid = commissions.filter(c => c.is_paid).reduce((s, c) => s + (c.paid_amount || 0), 0);
    const totalUnpaid = commissions.filter(c => !c.is_paid).reduce((s, c) => s + c.total_amount, 0);
    const byRole = commissions.reduce<Record<string, number>>((acc, c) => {
        acc[c.role] = (acc[c.role] || 0) + c.total_amount;
        return acc;
    }, {});

    return (
        <div className="space-y-4 max-w-7xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <Wallet className="h-4 w-4 text-blue-700" />
                    <span className="font-bold text-blue-700">ค่า DF / Commission</span>
                    <span className="text-slate-300">·</span>
                    <span><span className="font-bold text-slate-700 tabular-nums">{commissions.length}</span> พนักงาน</span>
                </p>

                {/* Month nav */}
                <div className="flex items-center gap-1.5">
                    <Link href={`/dashboard/commissions?month=${shiftMonth(month, -1)}`}>
                        <Button variant="outline" size="sm" className="rounded-lg h-9 w-9 p-0">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="px-4 h-9 rounded-lg border border-slate-300 bg-white flex items-center gap-2 font-bold text-sm text-slate-700">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        {formatMonth(month)}
                    </div>
                    <Link href={`/dashboard/commissions?month=${shiftMonth(month, 1)}`}>
                        <Button variant="outline" size="sm" className="rounded-lg h-9 w-9 p-0">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="รวมทั้งหมด" value={totalAll} icon={Wallet} color="teal" />
                <StatCard label="ยังไม่จ่าย" value={totalUnpaid} icon={Wallet} color="amber" />
                <StatCard label="จ่ายแล้ว" value={totalPaid} icon={CheckCircle} color="emerald" />
                <StatCard label="พนักงาน" value={commissions.length} icon={User} color="sky" isCount />
            </div>

            {/* Breakdown by role */}
            {Object.keys(byRole).length > 0 && (
                <div className="gonix-card-premium p-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">แยกตามตำแหน่ง</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        {Object.entries(byRole).map(([role, amount]) => (
                            <div key={role} className={`px-3 py-1.5 rounded-lg border ${ROLE_COLOR[role] || ROLE_COLOR.other}`}>
                                <span className="text-[11px] font-bold uppercase tracking-wider">{ROLE_LABEL[role] || role}</span>
                                <span className="ml-2 font-bold tabular-nums">฿{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Staff list */}
            {commissions.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <Wallet className="h-7 w-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700">ยังไม่มี Commission ในเดือนนี้</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        จะแสดงเมื่อ:<br />
                        1) มี invoice ที่ status = paid<br />
                        2) Visit มี doctor_id / nurse_id<br />
                        3) inventory ในใบเสร็จมี df_doctor / df_nurse {">"} 0
                    </p>
                </div>
            ) : (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2.5">พนักงาน</th>
                                    <th className="text-left px-4 py-2.5">ตำแหน่ง</th>
                                    <th className="text-center px-4 py-2.5">รายการ</th>
                                    <th className="text-right px-4 py-2.5">ยอดที่ได้</th>
                                    <th className="text-center px-4 py-2.5">สถานะ</th>
                                    <th className="px-4 py-2.5 w-44 text-right">การกระทำ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {commissions.map(c => {
                                    const Icon = ROLE_ICON[c.role] || User;
                                    return (
                                        <tr key={`${c.staff_id}-${c.role}`} className="border-t border-slate-100 hover:bg-slate-50/40">
                                            <td className="px-4 py-3">
                                                <Link href={`/dashboard/commissions/${c.staff_id}-${c.role}?month=${month}`} className="flex items-center gap-2.5 hover:text-blue-700">
                                                    <div className={`h-9 w-9 rounded-xl border flex items-center justify-center ${ROLE_COLOR[c.role] || ROLE_COLOR.other}`}>
                                                        <Icon className="h-4 w-4" />
                                                    </div>
                                                    <div className="font-bold text-slate-800 hover:text-blue-700 transition-colors">{c.staff_name}</div>
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${ROLE_COLOR[c.role] || ROLE_COLOR.other}`}>
                                                    {ROLE_LABEL[c.role] || c.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{c.entries_count}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="font-bold text-slate-800 tabular-nums text-base">
                                                    ฿{c.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </div>
                                                {c.is_paid && c.paid_amount !== c.total_amount && (
                                                    <div className="text-[11px] text-slate-500 tabular-nums">
                                                        จ่าย: ฿{(c.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {c.is_paid ? (
                                                    <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">
                                                        <CheckCircle className="h-3 w-3 mr-1" /> จ่ายแล้ว
                                                    </Badge>
                                                ) : (
                                                    <Badge className="border-0 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase">
                                                        รอจ่าย
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <Link href={`/dashboard/commissions/${c.staff_id}-${c.role}?month=${month}`}>
                                                        <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs gap-1">
                                                            <FileText className="h-3 w-3" /> ดู
                                                        </Button>
                                                    </Link>
                                                    <Link href={`/print/commissions/${month}/${c.staff_id}-${c.role}`} target="_blank">
                                                        <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs gap-1">
                                                            <Printer className="h-3 w-3" /> PDF
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setPayoutTarget(c)}
                                                        className={`rounded-lg h-8 text-xs gap-1 ${c.is_paid ? "bg-slate-600 hover:bg-slate-700" : "bg-emerald-600 hover:bg-emerald-700"} text-white`}
                                                    >
                                                        {c.is_paid ? "แก้ไข" : "จ่าย"}
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {payoutTarget && (
                <PayoutModal
                    target={payoutTarget}
                    onClose={() => setPayoutTarget(null)}
                    onSuccess={() => router.refresh()}
                />
            )}
        </div>
    );
}

function StatCard({
    label, value, icon: Icon, color, isCount,
}: {
    label: string;
    value: number;
    icon: React.ElementType;
    color: "teal" | "amber" | "emerald" | "sky";
    isCount?: boolean;
}) {
    const styles = {
        teal: { bg: "bg-blue-50/60", iconBg: "bg-blue-100", iconText: "text-blue-700", valueText: "text-blue-800" },
        amber: { bg: "bg-amber-50/60", iconBg: "bg-amber-100", iconText: "text-amber-700", valueText: "text-amber-800" },
        emerald: { bg: "bg-emerald-50/60", iconBg: "bg-emerald-100", iconText: "text-emerald-700", valueText: "text-emerald-800" },
        sky: { bg: "bg-cyan-50/60", iconBg: "bg-cyan-100", iconText: "text-cyan-700", valueText: "text-cyan-800" },
    }[color];

    return (
        <div className={`rounded-2xl border border-slate-200/60 ${styles.bg} p-4 flex items-center gap-3`}>
            <div className={`h-10 w-10 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 ${styles.iconText}`} />
            </div>
            <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                <div className={`text-xl font-bold ${styles.valueText} tabular-nums truncate`}>
                    {isCount ? value : `฿${value.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}
                </div>
            </div>
        </div>
    );
}

function PayoutModal({
    target, onClose, onSuccess,
}: {
    target: StaffCommissionSummary;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [amount, setAmount] = useState((target.paid_amount ?? target.total_amount).toString());
    const [method, setMethod] = useState<"cash" | "transfer" | "payroll">(target.is_paid ? "cash" : "cash");
    const [note, setNote] = useState("");

    const handleSubmit = () => {
        setError(null);
        startTransition(async () => {
            const result = await recordCommissionPayout({
                staff_id: target.staff_id,
                role: target.role,
                period_month: target.period_month,
                amount: parseFloat(amount),
                payment_method: method,
                note: note || undefined,
            });
            if (result.success) {
                onClose();
                onSuccess();
            } else {
                setError(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    const handleDelete = () => {
        if (!confirm("ลบบันทึกการจ่ายนี้?")) return;
        setError(null);
        startTransition(async () => {
            const result = await deleteCommissionPayout(target.staff_id, target.period_month);
            if (result.success) {
                onClose();
                onSuccess();
            } else {
                setError(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <div>
                        <h2 className="font-bold text-lg text-slate-800">บันทึกการจ่าย Commission</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {target.staff_name} · {ROLE_LABEL[target.role]} · {formatMonth(target.period_month)}
                        </p>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex justify-between text-sm">
                        <span className="text-slate-500">ยอดที่คำนวณได้</span>
                        <span className="font-bold tabular-nums">฿{target.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">ยอดที่จ่ายจริง (฿) *</Label>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="rounded-xl tabular-nums font-bold text-lg"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">วิธีจ่าย</Label>
                        <select
                            value={method}
                            onChange={e => setMethod(e.target.value as "cash" | "transfer" | "payroll")}
                            className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm"
                        >
                            <option value="cash">เงินสด</option>
                            <option value="transfer">โอน</option>
                            <option value="payroll">รวมในเงินเดือน</option>
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">หมายเหตุ</Label>
                        <Textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                            className="rounded-xl"
                            placeholder="(ไม่บังคับ)"
                        />
                    </div>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">{error}</div>
                    )}
                </div>

                <div className="p-5 pt-0 flex items-center justify-between gap-2">
                    {target.is_paid ? (
                        <Button variant="outline" onClick={handleDelete} disabled={isPending} className="rounded-xl text-rose-600 hover:bg-rose-50 hover:border-rose-300 gap-1.5">
                            <Trash2 className="h-4 w-4" /> ลบบันทึก
                        </Button>
                    ) : <div />}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                        <Button onClick={handleSubmit} disabled={isPending || !amount} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                            {target.is_paid ? "บันทึก" : "ยืนยันจ่าย"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
