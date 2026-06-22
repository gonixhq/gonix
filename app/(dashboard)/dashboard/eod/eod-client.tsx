"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    DoorClosed, AlertCircle, CheckCircle, Wallet, Users, FileText,
    Clock, X, History, RotateCcw, ArrowRight, ClipboardList, Calendar, ShieldCheck,
} from "lucide-react";
import { closeClinicDay, reopenClinicDay } from "@/lib/actions/end-of-day";
import { STATUS_LABEL, type EODSummary, type CloseDayHistory } from "@/lib/eod-types";

interface Props {
    summary: EODSummary;
    history: CloseDayHistory[];
}

export default function EODClient({ summary, history }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);
    const [notes, setNotes] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const hasPending = summary.pending_visits.length > 0;
    const canClose = !summary.already_closed && !hasPending;

    function handleClose() {
        setError(null);
        setSuccess(null);
        startTransition(async () => {
            // ส่ง date ตามที่ user เลือก (default = today via bangkokDate)
            const res = await closeClinicDay({ date: summary.close_date, notes: notes.trim() || undefined });
            if (!res.success) {
                setError(res.error || "เกิดข้อผิดพลาด");
                return;
            }
            setSuccess(`✓ ปิดยอดวันที่ ${formatDate(summary.close_date)} สำเร็จ — Counter ถูก reset แล้ว`);
            setShowConfirm(false);
            setTimeout(() => router.refresh(), 1500);
        });
    }

    function handleReopen() {
        if (!confirm(`ยกเลิกการปิดยอดวันที่ ${formatDate(summary.close_date)}?\n\nวันนี้จะกลับมาเป็น "ยังไม่ปิด" — แก้ไข/เพิ่มรายการแล้วปิดยอดใหม่ได้ (ยอดจะคำนวณใหม่ทั้งหมด)`)) return;
        setError(null);
        setSuccess(null);
        startTransition(async () => {
            const res = await reopenClinicDay(summary.close_date);
            if (!res.success) {
                setError(res.error || "ยกเลิกการปิดยอดไม่สำเร็จ");
                return;
            }
            setSuccess("✓ ยกเลิกการปิดยอดแล้ว — ตรวจสอบยอดให้ครบแล้วกดปิดยอดอีกครั้ง");
            setTimeout(() => router.refresh(), 1200);
        });
    }

    const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

    return (
        <div className="space-y-5 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Sub-header — compact + date picker */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <p className="text-sm font-medium text-slate-500">
                    <span className="font-bold text-blue-700">สรุปยอดวันที่ {formatDate(summary.close_date)}</span>
                    {summary.close_date !== todayISO && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold uppercase">ย้อนหลัง</span>
                    )}
                </p>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600 inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" /> เลือกวันที่:
                    </label>
                    <form method="get" className="inline-flex items-center gap-1.5">
                        <input
                            type="date"
                            name="date"
                            defaultValue={summary.close_date}
                            max={todayISO}
                            className="h-9 px-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <Button type="submit" size="sm" variant="outline" className="rounded-lg h-9 text-xs">ดู</Button>
                    </form>
                    {summary.close_date !== todayISO && (
                        <Link href="/dashboard/eod">
                            <Button size="sm" variant="ghost" className="rounded-lg h-9 text-xs gap-1">
                                <ArrowRight className="h-3 w-3" /> วันนี้
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* Status banner */}
            {summary.already_closed ? (
                <div className="rounded-2xl bg-emerald-50/80 border-2 border-emerald-300 px-5 py-4 flex items-start gap-3">
                    <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <div className="font-bold text-emerald-900">ปิดยอดวันที่ {formatDate(summary.close_date)} เรียบร้อยแล้ว</div>
                        <div className="text-sm text-emerald-700 mt-0.5">
                            ปิดโดย <span className="font-semibold">{summary.closed_record?.closed_by_name || "—"}</span>
                            {summary.closed_record?.closed_at && (
                                <> เมื่อ {formatDateTime(summary.closed_record.closed_at)}</>
                            )}
                        </div>
                    </div>
                    <Button
                        onClick={handleReopen}
                        disabled={pending}
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5 h-9 border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
                    >
                        <RotateCcw className="h-4 w-4" /> ยกเลิกการปิดยอด
                    </Button>
                </div>
            ) : hasPending ? (
                <div className="rounded-2xl bg-amber-50/80 border-2 border-amber-300 px-5 py-4 flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <div className="font-bold text-amber-900">
                            ยังไม่สามารถปิดยอดได้ — มี Visit ค้างอยู่ {summary.pending_visits.length} รายการ
                        </div>
                        <div className="text-sm text-amber-700 mt-0.5">
                            กรุณาจัดการ Visit ค้าง (รอตรวจ/อยู่ห้องตรวจ/รอยา/รอชำระเงิน) ให้เสร็จก่อน
                        </div>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl bg-blue-50/80 border-2 border-blue-300 px-5 py-4 flex items-start gap-3">
                    <DoorClosed className="h-6 w-6 text-blue-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <div className="font-bold text-blue-900">พร้อมปิดยอด</div>
                        <div className="text-sm text-blue-700 mt-0.5">
                            Visit ทั้งหมดของวันนี้ปิดงานเรียบร้อยแล้ว — กดปุ่ม &quot;ปิดยอดประจำวัน&quot; ที่ด้านล่าง
                        </div>
                    </div>
                </div>
            )}

            {/* Summary stats */}
            <div className={`grid grid-cols-2 gap-3 ${summary.anon_count > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
                <StatCard
                    icon={Users}
                    label="Visits ทั้งหมด"
                    value={summary.total_visits}
                    iconBg="bg-blue-100"
                    iconColor="text-blue-700"
                />
                <StatCard
                    icon={CheckCircle}
                    label="เสร็จสิ้น"
                    value={summary.visits_by_status.completed || 0}
                    iconBg="bg-emerald-100"
                    iconColor="text-emerald-700"
                />
                <StatCard
                    icon={X}
                    label="ยกเลิก"
                    value={summary.visits_by_status.cancelled || 0}
                    iconBg="bg-slate-100"
                    iconColor="text-slate-600"
                />
                {summary.anon_count > 0 && (
                    <StatCard
                        icon={ShieldCheck}
                        label="เคสนิรนาม"
                        value={`${summary.anon_count} · ฿${summary.anon_revenue.toLocaleString()}`}
                        iconBg="bg-cyan-100"
                        iconColor="text-cyan-700"
                    />
                )}
                <StatCard
                    icon={Wallet}
                    label="รายได้รวม"
                    value={`฿${summary.total_revenue.toLocaleString()}`}
                    iconBg="bg-amber-100"
                    iconColor="text-amber-700"
                />
            </div>

            {/* Pending visits list */}
            {hasPending && (
                <div className="gonix-card-premium p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <ClipboardList className="h-4 w-4 text-amber-700" />
                        <h2 className="text-base font-bold text-slate-800">Visit ค้าง ({summary.pending_visits.length})</h2>
                    </div>
                    <div className="space-y-2">
                        {summary.pending_visits.map((v) => (
                            <div
                                key={v.vn}
                                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50/60 border border-slate-200/60 hover:bg-slate-50 transition-colors"
                            >
                                {v.queue_number && (
                                    <div className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-sm font-black font-mono min-w-[50px] text-center">
                                        {v.queue_number}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-800 truncate">{v.patient_name}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                        <span className="font-mono">{v.hn}</span>
                                        <span>·</span>
                                        <span className="font-mono">{v.vn}</span>
                                        {v.visit_time && (
                                            <>
                                                <span>·</span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="h-3 w-3" /> {v.visit_time.slice(0, 5)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <Badge className="bg-amber-100 text-amber-800 border-0 shrink-0">
                                    {STATUS_LABEL[v.status] || v.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Counter info */}
            <div className="gonix-card-premium p-5">
                <div className="flex items-center gap-2 mb-3">
                    <RotateCcw className="h-4 w-4 text-blue-700" />
                    <h2 className="text-base font-bold text-slate-800">Counter ปัจจุบัน (จะถูก reset เมื่อปิดยอด)</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="px-4 py-3 rounded-xl bg-slate-50/60 border border-slate-200/60 flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">QUEUE</div>
                            <div className="text-xs text-slate-500 mt-0.5">เลขคิวล่าสุด</div>
                        </div>
                        <div className="text-2xl font-black tabular-nums text-slate-800">
                            {summary.queue_last_number > 0 ? `A${String(summary.queue_last_number).padStart(2, "0")}` : "—"}
                        </div>
                    </div>
                    <div className="px-4 py-3 rounded-xl bg-slate-50/60 border border-slate-200/60 flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">VN</div>
                            <div className="text-xs text-slate-500 mt-0.5">เลข Visit ล่าสุด</div>
                        </div>
                        <div className="text-2xl font-black tabular-nums text-slate-800">
                            {summary.vn_last_number || "—"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action area */}
            {!summary.already_closed && (
                <div className="gonix-card-premium p-5">
                    <h2 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-600" />
                        หมายเหตุ (ไม่บังคับ)
                    </h2>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="เช่น ปิดเร็วเพราะหยุดประจำเดือน, มีปัญหาระบบอินเตอร์เน็ต ..."
                        rows={3}
                        disabled={!canClose}
                        className="w-full rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100 disabled:opacity-50 resize-none"
                    />

                    {error && (
                        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                        </div>
                    )}
                    {success && (
                        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                        </div>
                    )}

                    <div className="mt-4 flex items-center justify-end gap-2">
                        <Button
                            onClick={() => setShowConfirm(true)}
                            disabled={!canClose || pending}
                            className="rounded-xl gap-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-md shadow-red-500/25 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
                        >
                            <DoorClosed className="h-4 w-4" />
                            ปิดยอดประจำวัน
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* History */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200/60 flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-600" />
                    <h2 className="text-base font-bold text-slate-800">ประวัติการปิดยอด</h2>
                    <span className="text-xs text-slate-500">({history.length} รายการล่าสุด)</span>
                </div>
                {history.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-slate-500">ยังไม่มีประวัติการปิดยอด</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                    <th className="text-left px-4 py-2">วันที่</th>
                                    <th className="text-left px-4 py-2">ปิดเมื่อ</th>
                                    <th className="text-left px-4 py-2">ผู้ปิด</th>
                                    <th className="text-right px-4 py-2">Visits</th>
                                    <th className="text-right px-4 py-2">เสร็จ</th>
                                    <th className="text-right px-4 py-2">ยกเลิก</th>
                                    <th className="text-right px-4 py-2">รายได้</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h) => (
                                    <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50/40 transition-colors">
                                        <td className="px-4 py-2.5 font-semibold text-slate-800 tabular-nums">{formatDate(h.close_date)}</td>
                                        <td className="px-4 py-2.5 text-slate-600 tabular-nums">{formatDateTime(h.closed_at)}</td>
                                        <td className="px-4 py-2.5 text-slate-600">{h.closed_by_name || "—"}</td>
                                        <td className="px-4 py-2.5 text-right font-bold tabular-nums">{h.total_visits}</td>
                                        <td className="px-4 py-2.5 text-right text-emerald-700 font-semibold tabular-nums">{h.total_visits_completed}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{h.total_visits_cancelled}</td>
                                        <td className="px-4 py-2.5 text-right font-bold text-amber-700 tabular-nums">฿{Number(h.total_revenue).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Confirm modal */}
            {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                                <DoorClosed className="h-5 w-5 text-red-700" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">ยืนยันปิดยอดประจำวัน</h3>
                                <p className="text-sm text-slate-500 mt-0.5">ปิดยอดวันที่ {formatDate(summary.close_date)}</p>
                            </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-600">Visits ทั้งหมด</span>
                                <span className="font-bold tabular-nums">{summary.total_visits} ราย</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-600">รายได้</span>
                                <span className="font-bold tabular-nums text-amber-700">฿{summary.total_revenue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-600">Counter QUEUE/VN ปัจจุบัน</span>
                                <span className="font-bold tabular-nums">
                                    {summary.queue_last_number > 0 ? `A${String(summary.queue_last_number).padStart(2, "0")}` : "—"} / {summary.vn_last_number || "—"}
                                </span>
                            </div>
                        </div>

                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div>
                                หลังกดยืนยัน — Counter QUEUE และ VN จะถูก reset เป็น <strong>0</strong> ทันที
                                Visit ใหม่ในวันถัดไปจะเริ่มจาก A01 / VN-...-0001 อีกครั้ง
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowConfirm(false)}
                                disabled={pending}
                                className="rounded-xl"
                            >
                                ยกเลิก
                            </Button>
                            <Button
                                onClick={handleClose}
                                disabled={pending}
                                className="rounded-xl gap-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-md shadow-red-500/25"
                            >
                                {pending ? "กำลังปิดยอด..." : "ยืนยันปิดยอด"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({
    icon: Icon, label, value, iconBg, iconColor,
}: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    iconBg: string;
    iconColor: string;
}) {
    return (
        <div className="gonix-card-premium p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 ${iconColor}`} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
                <div className="text-xl font-black text-slate-800 tabular-nums truncate">{value}</div>
            </div>
        </div>
    );
}

function formatDate(d: string): string {
    try {
        const date = new Date(d + "T00:00:00");
        return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
    } catch {
        return d;
    }
}

function formatDateTime(d: string): string {
    try {
        const date = new Date(d);
        return date.toLocaleString("th-TH", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return d;
    }
}
