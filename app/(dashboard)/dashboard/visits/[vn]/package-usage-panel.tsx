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
    Sparkles, Loader2, X, Calendar, Clock,
    Check, CheckCircle, AlertTriangle, History,
} from "lucide-react";
import {
    getPatientActivePackages,
    usePackageSession,
    listActivePackages,
    purchasePackage,
} from "@/lib/actions/packages";
import type {
    PatientPackageActive,
    ServicePackage,
} from "@/lib/package-types";

interface Props {
    hn: string;
    vn: string;
}

export default function PackageUsagePanel({ hn, vn }: Props) {
    const router = useRouter();
    const [active, setActive] = useState<PatientPackageActive[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSell, setShowSell] = useState(false);
    const [confirmUse, setConfirmUse] = useState<PatientPackageActive | null>(null);

    const refresh = async () => {
        setLoading(true);
        const data = await getPatientActivePackages(hn);
        setActive(data);
        setLoading(false);
    };

    useEffect(() => {
        refresh();
    }, [hn]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-rose-500" />
                        คอสบริการของคนไข้
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        สิทธิ์ active ของ HN {hn}
                    </p>
                </div>
                <Button onClick={() => setShowSell(true)} className="rounded-xl gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                    <Sparkles className="h-4 w-4" /> ขายคอสใหม่
                </Button>
            </div>

            {loading ? (
                <div className="p-8 text-center text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </div>
            ) : active.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Sparkles className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-600 font-medium">คนไข้ยังไม่มีคอส active</p>
                    <p className="text-xs text-slate-500 mt-1">กดปุ่ม &ldquo;ขายคอสใหม่&rdquo; เพื่อเริ่ม</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {active.map(pp => {
                        const expiringSoon = pp.days_remaining <= 30;
                        const noSessionsLeft = pp.remaining_sessions <= 0;
                        const isExpired = pp.is_expired;
                        const canUse = !isExpired && !noSessionsLeft;
                        return (
                            <div key={pp.id} className="gonix-card-premium p-4">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            {pp.category && (
                                                <Badge className="border-0 bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">
                                                    {pp.category}
                                                </Badge>
                                            )}
                                        </div>
                                        <h4 className="font-bold text-slate-800 line-clamp-2">{pp.package_name}</h4>
                                    </div>
                                </div>

                                {/* Progress */}
                                <div className="mb-3">
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-bold text-slate-700">
                                            ใช้ไป {pp.used_sessions} / {pp.total_sessions} ครั้ง
                                        </span>
                                        <span className="font-bold text-blue-700 tabular-nums">
                                            เหลือ {pp.remaining_sessions}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
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
                                            isExpired ? "text-rose-700" : expiringSoon ? "text-amber-700" : "text-slate-700"
                                        }`}>
                                            {new Date(pp.expires_at).toLocaleDateString("th-TH")}
                                            {!isExpired && (
                                                <span className="ml-1 text-[10px] opacity-70">
                                                    ({pp.days_remaining}d)
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* Warnings */}
                                {isExpired && (
                                    <div className="mb-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-700 inline-flex items-center gap-1.5 w-full">
                                        <AlertTriangle className="h-3 w-3 shrink-0" /> หมดอายุแล้ว
                                    </div>
                                )}
                                {!isExpired && noSessionsLeft && (
                                    <div className="mb-2 p-2 bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600 inline-flex items-center gap-1.5 w-full">
                                        <Check className="h-3 w-3 shrink-0" /> ใช้ครบแล้ว
                                    </div>
                                )}
                                {!isExpired && expiringSoon && !noSessionsLeft && (
                                    <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 inline-flex items-center gap-1.5 w-full">
                                        <AlertTriangle className="h-3 w-3 shrink-0" /> ใกล้หมดอายุ (เหลือ {pp.days_remaining} วัน)
                                    </div>
                                )}

                                {/* Action */}
                                <Button
                                    onClick={() => setConfirmUse(pp)}
                                    disabled={!canUse}
                                    className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Check className="h-4 w-4 mr-1.5" />
                                    ตัด 1 ครั้ง
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}

            {showSell && (
                <SellPackageModal
                    hn={hn}
                    onClose={() => setShowSell(false)}
                    onSuccess={() => { refresh(); router.refresh(); }}
                />
            )}
            {confirmUse && (
                <ConfirmUseModal
                    pp={confirmUse}
                    vn={vn}
                    onClose={() => setConfirmUse(null)}
                    onSuccess={() => { refresh(); router.refresh(); }}
                />
            )}
        </div>
    );
}

function ConfirmUseModal({
    pp, vn, onClose, onSuccess,
}: {
    pp: PatientPackageActive;
    vn: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState("");

    const handleConfirm = () => {
        setError(null);
        startTransition(async () => {
            const result = await usePackageSession({
                patient_package_id: pp.id,
                visit_vn: vn,
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

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="p-5">
                    <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                        <Check className="h-6 w-6 text-blue-600" />
                    </div>
                    <h2 className="font-bold text-lg text-slate-800">ยืนยันตัดครั้งคอสนี้?</h2>
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-1">
                        <div className="font-bold text-slate-800">{pp.package_name}</div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">กำลังตัดครั้งที่</span>
                            <span className="font-black text-blue-700 tabular-nums">
                                {pp.total_sessions - pp.remaining_sessions + 1} / {pp.total_sessions}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">หลังตัดจะเหลือ</span>
                            <span className="font-bold text-slate-700 tabular-nums">
                                {pp.remaining_sessions - 1} / {pp.total_sessions} ครั้ง
                            </span>
                        </div>
                    </div>
                    <p className="mt-2 text-[11px] text-amber-600">⚠ ตัดแล้วย้อนกลับยาก — ตรวจสอบจำนวนครั้งให้ถูกต้อง</p>

                    <div className="mt-3 space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">หมายเหตุ</Label>
                        <Textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="(ไม่บังคับ)"
                            rows={2}
                            className="rounded-xl"
                        />
                    </div>

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

function SellPackageModal({
    hn, onClose, onSuccess,
}: {
    hn: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
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
