"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    Sparkles, Loader2, X, Calendar, Clock, Check,
    History, AlertTriangle, ChevronDown, ChevronUp,
    Undo2, FileText, RefreshCw, DollarSign, TrendingDown,
} from "lucide-react";
import {
    getPatientAllPackages,
    listActivePackages,
    purchasePackage,
    getPackageUsages,
    undoPackageUsage,
    refundPackage,
    usePackageSession,
} from "@/lib/actions/packages";
import type {
    PatientPackageActive,
    ServicePackage,
    PackageUsage,
    PackageStatus,
} from "@/lib/package-types";
import { PACKAGE_STATUS_LABEL, PACKAGE_STATUS_COLOR } from "@/lib/package-types";

interface Props {
    hn: string;
}

export default function PatientPackagesTab({ hn }: Props) {
    const [packages, setPackages] = useState<PatientPackageActive[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSell, setShowSell] = useState(false);
    const [filter, setFilter] = useState<"all" | "active" | "history">("active");

    const refresh = async () => {
        setLoading(true);
        const data = await getPatientAllPackages(hn);
        setPackages(data);
        setLoading(false);
    };

    useEffect(() => {
        refresh();
    }, [hn]);

    const active = packages.filter(p => p.status === "active");
    const history = packages.filter(p => p.status !== "active");

    const filtered = filter === "active" ? active : filter === "history" ? history : packages;

    // Summary
    const totalSpent = packages.reduce((s, p) => s + Number(p.paid_amount || 0), 0);
    const totalRemaining = active.reduce((s, p) => s + p.remaining_sessions, 0);
    const totalUsed = packages.reduce((s, p) => s + p.used_sessions, 0);

    return (
        <div className="space-y-4">
            {/* Stat row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat label="คอสที่ Active" value={active.length} icon={Sparkles} color="teal" />
                <MiniStat label="ครั้งคงเหลือ" value={totalRemaining} icon={Check} color="rose" />
                <MiniStat label="ครั้งใช้ไป" value={totalUsed} icon={TrendingDown} color="sky" />
                <MiniStat label="ยอดซื้อรวม" value={`฿${totalSpent.toLocaleString()}`} icon={DollarSign} color="emerald" />
            </div>

            {/* Header + filter */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                    <FilterChip active={filter === "active"} onClick={() => setFilter("active")} color="teal">
                        Active ({active.length})
                    </FilterChip>
                    <FilterChip active={filter === "history"} onClick={() => setFilter("history")}>
                        ประวัติ ({history.length})
                    </FilterChip>
                    <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                        ทั้งหมด ({packages.length})
                    </FilterChip>
                </div>
                <Button onClick={() => setShowSell(true)} className="rounded-xl gap-1.5 h-9 bg-blue-600 hover:bg-blue-700 text-white">
                    <Sparkles className="h-4 w-4" /> ขายคอสใหม่
                </Button>
            </div>

            {/* List */}
            {loading ? (
                <div className="p-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="h-7 w-7 text-rose-400" />
                    </div>
                    <h3 className="font-bold text-slate-700">
                        {filter === "active" ? "ไม่มีคอส Active" : filter === "history" ? "ไม่มีประวัติคอส" : "คนไข้คนนี้ยังไม่เคยซื้อคอส"}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">กดปุ่ม &ldquo;ขายคอสใหม่&rdquo; เพื่อเริ่ม</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filtered.map(pp => (
                        <PackageCard key={pp.id} pp={pp} onRefresh={refresh} />
                    ))}
                </div>
            )}

            {showSell && (
                <SellPackageModal
                    hn={hn}
                    onClose={() => setShowSell(false)}
                    onSuccess={refresh}
                />
            )}
        </div>
    );
}

function PackageCard({ pp, onRefresh }: { pp: PatientPackageActive; onRefresh: () => void }) {
    const router = useRouter();
    const [showHistory, setShowHistory] = useState(false);
    const [showRefund, setShowRefund] = useState(false);
    const [showUse, setShowUse] = useState(false);
    const [usages, setUsages] = useState<PackageUsage[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isPending, startTransition] = useTransition();

    const toggleHistory = async () => {
        if (!showHistory && usages.length === 0) {
            setLoadingHistory(true);
            const data = await getPackageUsages(pp.id);
            setUsages(data);
            setLoadingHistory(false);
        }
        setShowHistory(!showHistory);
    };

    const handleUndo = (usageId: string) => {
        if (!confirm("ยกเลิกการตัดครั้งล่าสุด?")) return;
        startTransition(async () => {
            const result = await undoPackageUsage(usageId);
            if (result.success) {
                setUsages([]);
                setShowHistory(false);
                onRefresh();
                router.refresh();
            } else {
                alert(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    const expiringSoon = pp.days_remaining <= 30 && pp.status === "active";
    const lastUsage = usages.length > 0 ? usages[usages.length - 1] : null;

    return (
        <div className="gonix-card-premium p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                        {pp.category && (
                            <Badge className="border-0 bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">
                                {pp.category}
                            </Badge>
                        )}
                        <Badge className={`border-0 text-[10px] font-bold uppercase ${PACKAGE_STATUS_COLOR[pp.status as PackageStatus]}`}>
                            {PACKAGE_STATUS_LABEL[pp.status as PackageStatus]}
                        </Badge>
                    </div>
                    <h4 className="font-bold text-slate-800 line-clamp-2">{pp.package_name}</h4>
                </div>
            </div>

            {/* Progress */}
            <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-700">
                        ใช้ {pp.used_sessions} / {pp.total_sessions} ครั้ง
                    </span>
                    <span className="font-bold text-blue-700 tabular-nums">
                        เหลือ {pp.remaining_sessions}
                    </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all ${
                            pp.status === "active"
                                ? "bg-gradient-to-r from-blue-500 to-cyan-500"
                                : pp.status === "completed"
                                    ? "bg-emerald-400"
                                    : "bg-slate-400"
                        }`}
                        style={{ width: `${(pp.used_sessions / pp.total_sessions) * 100}%` }}
                    />
                </div>
            </div>

            {/* Meta */}
            <div className="space-y-1.5 text-xs mb-3">
                <div className="flex items-center justify-between">
                    <span className="text-slate-500 inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> ซื้อ
                    </span>
                    <span className="text-slate-700 font-medium">
                        {new Date(pp.purchased_at).toLocaleDateString("th-TH")}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-slate-500 inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> หมดอายุ
                    </span>
                    <span className={`font-bold tabular-nums ${
                        pp.is_expired ? "text-rose-700" : expiringSoon ? "text-amber-700" : "text-slate-700"
                    }`}>
                        {new Date(pp.expires_at).toLocaleDateString("th-TH")}
                        {!pp.is_expired && pp.status === "active" && (
                            <span className="ml-1 text-[10px] opacity-70">({pp.days_remaining}d)</span>
                        )}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-slate-500 inline-flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> ยอดจ่าย
                    </span>
                    <span className="text-slate-700 font-bold tabular-nums">
                        ฿{Number(pp.paid_amount).toLocaleString()}
                    </span>
                </div>
                {pp.invoice_id && (
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500 inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" /> ใบเสร็จ
                        </span>
                        <Link href={`/dashboard/finance/${pp.invoice_id}`} className="text-cyan-600 hover:text-cyan-700 font-mono text-[11px] underline">
                            {pp.invoice_id}
                        </Link>
                    </div>
                )}
            </div>

            {/* Warnings */}
            {expiringSoon && (
                <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 inline-flex items-center gap-1.5 w-full">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> ใกล้หมดอายุ (เหลือ {pp.days_remaining} วัน)
                </div>
            )}

            {/* Note */}
            {pp.note && (
                <div className="mb-2 p-2 bg-slate-50 rounded-lg text-[11px] text-slate-600 whitespace-pre-wrap">
                    {pp.note}
                </div>
            )}

            {/* Primary action: Use session (for active packages with remaining sessions) */}
            {pp.status === "active" && pp.remaining_sessions > 0 && !pp.is_expired && (
                <Button
                    onClick={() => setShowUse(true)}
                    className="w-full rounded-lg h-10 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold gap-1.5 mb-2"
                >
                    <Check className="h-4 w-4" /> ตัด 1 ครั้ง
                </Button>
            )}

            {/* Secondary actions */}
            <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                <Button
                    onClick={toggleHistory}
                    variant="outline"
                    size="sm"
                    className="rounded-lg flex-1 h-8 text-xs gap-1.5"
                >
                    <History className="h-3 w-3" />
                    ประวัติใช้
                    {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                {pp.status === "active" && (
                    <Button
                        onClick={() => setShowRefund(true)}
                        variant="outline"
                        size="sm"
                        className="rounded-lg h-8 text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                    >
                        <RefreshCw className="h-3 w-3 mr-1" /> คืนเงิน
                    </Button>
                )}
            </div>

            {/* Usage history */}
            {showHistory && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                    {loadingHistory ? (
                        <div className="text-center py-3">
                            <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" />
                        </div>
                    ) : usages.length === 0 ? (
                        <p className="text-center text-xs text-slate-500 py-3">ยังไม่เคยใช้</p>
                    ) : (
                        <div className="space-y-1.5">
                            {usages.map(u => {
                                const isLast = u.id === lastUsage?.id && pp.status === "active";
                                return (
                                    <div key={u.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                                {u.session_no}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="text-slate-700 font-medium">
                                                    {new Date(u.used_at).toLocaleDateString("th-TH")}
                                                    {" "}
                                                    <span className="text-slate-500">
                                                        {new Date(u.used_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                </div>
                                                {u.note && <div className="text-slate-500 truncate">{u.note}</div>}
                                                {u.visit_vn && (
                                                    <Link href={`/dashboard/visits/${u.visit_vn}`} className="text-cyan-600 hover:underline font-mono text-[10px]">
                                                        VN: {u.visit_vn}
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                        {isLast && (
                                            <button
                                                onClick={() => handleUndo(u.id)}
                                                disabled={isPending}
                                                className="text-rose-600 hover:bg-rose-100 rounded p-1 shrink-0"
                                                title="ยกเลิกการตัดครั้งนี้"
                                            >
                                                <Undo2 className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {showRefund && (
                <RefundModal pp={pp} onClose={() => setShowRefund(false)} onSuccess={onRefresh} />
            )}
            {showUse && (
                <UseSessionModal pp={pp} onClose={() => setShowUse(false)} onSuccess={onRefresh} />
            )}
        </div>
    );
}

function UseSessionModal({
    pp, onClose, onSuccess,
}: {
    pp: PatientPackageActive;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const router = useRouter();
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleConfirm = () => {
        setError(null);
        startTransition(async () => {
            const result = await usePackageSession({
                patient_package_id: pp.id,
                note: note || undefined,
            });
            if (result.success) {
                onClose();
                onSuccess();
                router.refresh();
            } else {
                setError(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="p-5">
                    <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                        <Check className="h-6 w-6 text-blue-600" />
                    </div>
                    <h2 className="font-bold text-lg text-slate-800">ตัด 1 ครั้ง?</h2>
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-1">
                        <div className="font-bold text-slate-800">{pp.package_name}</div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">หลังตัดจะเหลือ</span>
                            <span className="font-bold text-blue-700 tabular-nums">
                                {pp.remaining_sessions - 1} / {pp.total_sessions} ครั้ง
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">หมายเหตุ</Label>
                        <Textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="(ไม่บังคับ) — เช่น Walk-in / Counter / etc."
                            rows={2}
                            className="rounded-xl"
                        />
                    </div>

                    <p className="text-[11px] text-slate-500 mt-2">
                        ⚠ การตัดครั้งนี้ไม่ได้ผูกกับ visit ใดๆ — ถ้าตัดจาก Doctor Room จะผูกกับ visit อัตโนมัติ
                    </p>

                    {error && (
                        <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">{error}</div>
                    )}
                </div>
                <div className="p-5 pt-0 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                    <Button onClick={handleConfirm} disabled={isPending} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                        ยืนยันตัดครั้ง
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function RefundModal({
    pp, onClose, onSuccess,
}: {
    pp: PatientPackageActive;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const router = useRouter();
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleConfirm = () => {
        if (!reason.trim()) {
            setError("กรุณาระบุเหตุผล");
            return;
        }
        setError(null);
        startTransition(async () => {
            const result = await refundPackage(pp.id, reason);
            if (result.success) {
                onClose();
                onSuccess();
                router.refresh();
            } else {
                setError(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="p-5">
                    <div className="h-12 w-12 rounded-xl bg-rose-100 flex items-center justify-center mb-3">
                        <RefreshCw className="h-6 w-6 text-rose-600" />
                    </div>
                    <h2 className="font-bold text-lg text-slate-800">คืนเงินคอสนี้?</h2>
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                        <div className="font-bold text-slate-800">{pp.package_name}</div>
                        <div className="text-xs text-slate-500 mt-1">
                            ใช้ไป {pp.used_sessions}/{pp.total_sessions} · จ่ายมา ฿{Number(pp.paid_amount).toLocaleString()}
                        </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">เหตุผล *</Label>
                        <Textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="คนไข้ขอคืนเงิน เนื่องจาก..."
                            rows={3}
                            className="rounded-xl"
                            autoFocus
                        />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                        ⚠ สถานะจะเปลี่ยนเป็น &ldquo;คืนเงินแล้ว&rdquo; — ไม่สามารถตัดครั้งได้อีก<br />
                        การจ่ายเงินคืนต้องทำที่ห้องการเงินแยก
                    </p>
                    {error && (
                        <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">{error}</div>
                    )}
                </div>
                <div className="p-5 pt-0 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                    <Button onClick={handleConfirm} disabled={isPending} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white">
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                        ยืนยันคืนเงิน
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function SellPackageModal({
    hn, onClose, onSuccess,
}: {
    hn: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [loadingPkgs, setLoadingPkgs] = useState(true);
    const [packages, setPackages] = useState<ServicePackage[]>([]);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<ServicePackage | null>(null);
    const [paidAmount, setPaidAmount] = useState<number>(0);
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listActivePackages().then(d => {
            setPackages(d);
            setLoadingPkgs(false);
        });
    }, []);

    const filtered = packages.filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
    });

    const handleSell = () => {
        if (!selected) return;
        setError(null);
        startTransition(async () => {
            const result = await purchasePackage({
                hn,
                package_id: selected.id,
                paid_amount: paidAmount,
                note: note || undefined,
            });
            if (result.success) {
                onClose();
                onSuccess();
                router.refresh();
            } else {
                setError(result.error || "เกิดข้อผิดพลาด");
            }
        });
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <div>
                        <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-rose-500" />
                            ขายคอสบริการ
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">HN {hn}</p>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    <Input
                        type="search"
                        placeholder="ค้นหาคอส..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="rounded-xl"
                    />

                    {loadingPkgs ? (
                        <div className="p-8 text-center">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">
                            ไม่มีคอสในระบบ — <Link href="/dashboard/inventory/packages" className="text-blue-600 font-bold underline">เพิ่มคอสใหม่</Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {filtered.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => { setSelected(p); setPaidAmount(Number(p.price)); }}
                                    className={`text-left p-3 rounded-xl border-2 transition-all ${
                                        selected?.id === p.id
                                            ? "border-blue-500 bg-blue-50 shadow-sm"
                                            : "border-slate-200 hover:border-slate-300 bg-white"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                            {p.code}
                                        </span>
                                        {p.category && (
                                            <Badge className="border-0 bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">
                                                {p.category}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="font-bold text-slate-800 text-sm line-clamp-1">{p.name}</div>
                                    <div className="flex items-center justify-between mt-1 text-xs">
                                        <span className="text-slate-500">{p.total_sessions} ครั้ง · {p.validity_days}d</span>
                                        <span className="font-bold text-blue-700 tabular-nums">฿{Number(p.price).toLocaleString()}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {selected && (
                        <div className="pt-3 border-t border-slate-100 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">ยอดที่จ่ายจริง (฿)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={paidAmount}
                                        onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                                        className="rounded-xl tabular-nums"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">ราคาเต็ม</Label>
                                    <div className="h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center font-bold tabular-nums text-slate-700">
                                        ฿{Number(selected.price).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">หมายเหตุ</Label>
                                <Textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="โปรโมชั่น/ส่วนลด..."
                                    rows={2}
                                    className="rounded-xl"
                                />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">{error}</div>
                    )}
                </div>

                <div className="p-5 border-t border-slate-100 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                        ⚠ การขายนี้ยังไม่ผ่านใบเสร็จ <br />
                        <span className="text-[10px]">ต้องลงรายการชำระแยกที่ห้องการเงิน</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                        <Button onClick={handleSell} disabled={!selected || isPending} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                            ยืนยันขาย
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function MiniStat({ label, value, icon: Icon, color }: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: "teal" | "rose" | "sky" | "emerald";
}) {
    const styles = {
        teal: { bg: "bg-blue-50/60", iconBg: "bg-blue-100", iconText: "text-blue-700", valueText: "text-blue-800" },
        rose: { bg: "bg-rose-50/60", iconBg: "bg-rose-100", iconText: "text-rose-700", valueText: "text-rose-800" },
        sky: { bg: "bg-cyan-50/60", iconBg: "bg-cyan-100", iconText: "text-cyan-700", valueText: "text-cyan-800" },
        emerald: { bg: "bg-emerald-50/60", iconBg: "bg-emerald-100", iconText: "text-emerald-700", valueText: "text-emerald-800" },
    }[color];
    return (
        <div className={`rounded-2xl border border-slate-200/60 ${styles.bg} backdrop-blur-md p-3 flex items-center gap-3`}>
            <div className={`h-9 w-9 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4 w-4 ${styles.iconText}`} />
            </div>
            <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                <div className={`text-base font-bold ${styles.valueText} tabular-nums truncate`}>{value}</div>
            </div>
        </div>
    );
}

function FilterChip({ active, onClick, children, color = "slate" }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    color?: "slate" | "teal";
}) {
    const activeStyle = color === "teal"
        ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
        : "bg-slate-700 text-white shadow-sm";
    return (
        <button
            onClick={onClick}
            className={`px-3 h-8 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                active ? activeStyle : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
            {children}
        </button>
    );
}
