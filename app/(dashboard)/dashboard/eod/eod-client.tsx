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
    Calculator, Coins, CreditCard, ArrowLeftRight, Save,
} from "lucide-react";
import { closeClinicDay, reopenClinicDay, setOpeningFloat } from "@/lib/actions/end-of-day";
import { STATUS_LABEL, type EODSummary, type CloseDayHistory } from "@/lib/eod-types";
import type { DiscountDaySummary } from "@/lib/actions/campaigns";
import { DISCOUNT_KIND_LABEL } from "@/lib/campaign-types";
import { cn } from "@/lib/utils";

const money = (n: number) => `฿${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const DENOMS = [1000, 500, 100, 50, 20, 10, 5, 1];

interface StaffReconRow { name: string; closes: number; shortCount: number; netOverShort: number; shortRate: number }
interface Props {
    summary: EODSummary;
    history: CloseDayHistory[];
    staffPattern: StaffReconRow[];
    discounts: DiscountDaySummary;
}

// เกินกว่านี้ถือว่าผิดปกติ → เตือนก่อนปิดยอด
const DISCOUNT_ALERT_PCT = 20;

export default function EODClient({ summary, history, staffPattern, discounts }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);
    const [notes, setNotes] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // ── กระทบเงินสด/ช่องทาง ──
    const [startingFloat, setStartingFloat] = useState(
        summary.opening_float != null ? String(summary.opening_float)
            : summary.last_starting_float ? String(summary.last_starting_float) : "");
    const [actualCash, setActualCash] = useState("");
    const [transferActual, setTransferActual] = useState("");
    const [creditActual, setCreditActual] = useState("");
    const [reconNote, setReconNote] = useState("");
    const [floatSaved, setFloatSaved] = useState(false);
    const [showDenom, setShowDenom] = useState(false);
    const [denom, setDenom] = useState<Record<number, string>>({});

    const floatNum = Number(startingFloat) || 0;
    const expectedCash = floatNum + summary.cash_received - summary.petty_total;
    const actualNum = actualCash.trim() === "" ? null : (Number(actualCash) || 0);
    const overShort = actualNum != null ? actualNum - expectedCash : null;
    const transferActualNum = transferActual.trim() === "" ? null : (Number(transferActual) || 0);
    const creditActualNum = creditActual.trim() === "" ? null : (Number(creditActual) || 0);
    const transferOverShort = transferActualNum != null ? transferActualNum - summary.transfer_total : null;
    const creditOverShort = creditActualNum != null ? creditActualNum - summary.credit_total : null;
    const denomTotal = DENOMS.reduce((s, d) => s + (Number(denom[d]) || 0) * d, 0);

    function saveOpeningFloat() {
        startTransition(async () => {
            const res = await setOpeningFloat(summary.close_date, floatNum);
            if (res.success) { setFloatSaved(true); setTimeout(() => router.refresh(), 600); }
        });
    }

    const hasPending = summary.pending_visits.length > 0;
    // ต้องนับจริงครบทุกช่องทางที่มียอด ก่อนปิดได้
    const reconReady = actualNum != null
        && (summary.transfer_total <= 0 || transferActualNum != null)
        && (summary.credit_total <= 0 || creditActualNum != null);
    const canClose = !summary.already_closed && !hasPending && reconReady;

    function handleClose() {
        setError(null);
        setSuccess(null);
        startTransition(async () => {
            // ส่ง date ตามที่ user เลือก (default = today via bangkokDate)
            const res = await closeClinicDay({
                date: summary.close_date,
                notes: notes.trim() || undefined,
                startingFloat: floatNum,
                actualCash: actualNum,
                transferActual: transferActualNum,
                creditActual: creditActualNum,
                reconNote: reconNote.trim() || undefined,
            });
            if (!res.success) {
                setError(res.error || "เกิดข้อผิดพลาด");
                return;
            }
            setSuccess(`✓ ปิดยอดวันที่ ${formatDate(summary.close_date)} สำเร็จ — Counter ถูก reset แล้ว`);
            setShowConfirm(false);
            // เด้งหน้าพิมพ์ใบสรุปปิดกะ
            window.open(`/print/eod/${summary.close_date}`, "_blank");
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
            {/* ── Day header hero ── */}
            <div className="gonix-card-premium overflow-hidden">
                <div className={cn("h-1.5 w-full", summary.already_closed ? "bg-emerald-500" : hasPending ? "bg-amber-400" : "bg-blue-500")} />
                <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0",
                            summary.already_closed ? "bg-emerald-100" : hasPending ? "bg-amber-100" : "bg-blue-100")}>
                            <Calendar className={cn("h-7 w-7", summary.already_closed ? "text-emerald-700" : hasPending ? "text-amber-600" : "text-blue-700")} strokeWidth={2.2} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl font-black text-slate-800 leading-tight">{formatDateLong(summary.close_date)}</h1>
                                {summary.close_date !== todayISO && <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold uppercase">ย้อนหลัง</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {summary.already_closed ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700"><CheckCircle className="h-3.5 w-3.5" /> ปิดยอดแล้ว</span>
                                ) : hasPending ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700"><AlertCircle className="h-3.5 w-3.5" /> มี Visit ค้าง {summary.pending_visits.length} รายการ</span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700"><DoorClosed className="h-3.5 w-3.5" /> พร้อมปิดยอด</span>
                                )}
                                {summary.already_closed && summary.closed_record && (
                                    <span className="text-xs text-slate-500">โดย <span className="font-semibold text-slate-600">{summary.closed_record.closed_by_name || "—"}</span>{summary.closed_record.closed_at && ` · ${formatDateTime(summary.closed_record.closed_at)}`}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {summary.already_closed && (
                            <>
                                <Link href={`/print/eod/${summary.close_date}`} target="_blank">
                                    <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50"><FileText className="h-4 w-4" /> พิมพ์ใบปิดกะ</Button>
                                </Link>
                                <Button onClick={handleReopen} disabled={pending} variant="outline" size="sm" className="rounded-xl gap-1.5 h-9 border-amber-300 text-amber-700 hover:bg-amber-50"><RotateCcw className="h-4 w-4" /> ยกเลิกการปิดยอด</Button>
                            </>
                        )}
                        <form method="get" className="inline-flex items-center gap-1.5">
                            <input type="date" name="date" defaultValue={summary.close_date} max={todayISO}
                                className="h-9 px-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                            <Button type="submit" size="sm" variant="outline" className="rounded-lg h-9 text-xs">ดู</Button>
                        </form>
                        {summary.close_date !== todayISO && (
                            <Link href="/dashboard/eod"><Button size="sm" variant="ghost" className="rounded-lg h-9 text-xs gap-1"><ArrowRight className="h-3 w-3" /> วันนี้</Button></Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Actionable banner (เฉพาะยังไม่ปิด) */}
            {!summary.already_closed && (hasPending ? (
                <div className="rounded-2xl bg-amber-50/80 border border-amber-200 px-4 py-3 flex items-center gap-3 text-sm">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    <span className="text-amber-800">ปิดยอดไม่ได้จนกว่าจะเคลียร์ <span className="font-bold">Visit ค้าง {summary.pending_visits.length} รายการ</span> (รอตรวจ/ห้องตรวจ/รอยา/รอชำระ) ด้านล่าง</span>
                </div>
            ) : (
                <div className="rounded-2xl bg-blue-50/80 border border-blue-200 px-4 py-3 flex items-center gap-3 text-sm">
                    <DoorClosed className="h-5 w-5 text-blue-700 shrink-0" />
                    <span className="text-blue-800">Visit ปิดงานครบแล้ว — ตรวจกระทบยอดเงินด้านล่างแล้วกด <span className="font-bold">&quot;ปิดยอดประจำวัน&quot;</span></span>
                </div>
            ))}

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

            {/* Cash Reconciliation */}
            <div className="gonix-card-premium p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Calculator className="h-4 w-4 text-emerald-700" />
                    <h2 className="text-base font-bold text-slate-800">กระทบยอดเงิน (Reconciliation)</h2>
                    <span className="text-xs text-slate-400">— ตรวจนับก่อนปิดยอด</span>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    {/* Cash column */}
                    <div className="rounded-2xl border border-slate-200/70 p-4 space-y-2">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-1">
                            <Coins className="h-4 w-4 text-amber-600" /> เงินสด (Cash)
                        </div>

                        {/* เงินทอนตั้งต้น */}
                        {summary.already_closed ? (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-slate-500">เงินทอนตั้งต้น</span>
                                <span className="text-sm font-bold tabular-nums">{money(summary.closed_recon?.starting_float || 0)}</span>
                            </div>
                        ) : (
                            <div className="rounded-lg bg-amber-50/60 border border-amber-100 p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-slate-600">เงินทอนตั้งต้น (เปิดร้าน)</span>
                                    {summary.opening_float != null ? (
                                        <span className="text-[11px] text-emerald-600 font-bold inline-flex items-center gap-1"><CheckCircle className="h-3 w-3" /> ตั้งแล้ว{summary.opening_float_by ? ` · ${summary.opening_float_by}` : ""}</span>
                                    ) : (
                                        <span className="text-[11px] text-amber-600 font-semibold">ยังไม่ได้ตั้งตอนเช้า</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="relative flex-1">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">฿</span>
                                        <input value={startingFloat} onChange={(e) => { setStartingFloat(e.target.value.replace(/[^\d.]/g, "")); setFloatSaved(false); }}
                                            inputMode="decimal" placeholder="0"
                                            className="w-full h-9 rounded-lg border border-slate-300 pl-6 pr-2 text-right text-sm font-bold tabular-nums focus:border-emerald-500 focus:outline-none" />
                                    </div>
                                    <Button onClick={saveOpeningFloat} disabled={pending} size="sm" variant="outline"
                                        className={cn("h-9 rounded-lg text-xs gap-1", floatSaved && "border-emerald-300 text-emerald-700 bg-emerald-50")}>
                                        {floatSaved ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} {floatSaved ? "บันทึกแล้ว" : "บันทึก"}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-slate-400">ตั้งตอนเช้าได้เลย — ตอนปิดยอดจะดึงมาเติมให้อัตโนมัติ กันลืม</p>
                            </div>
                        )}
                        <div className="flex items-center justify-between text-sm"><span className="text-slate-500">+ รับเงินสดวันนี้</span><span className="font-semibold tabular-nums text-emerald-700">{money(summary.cash_received)}</span></div>
                        <div className="flex items-center justify-between text-sm"><span className="text-slate-500">− รายจ่ายย่อย</span><span className="font-semibold tabular-nums text-rose-600">{money(summary.petty_total)}</span></div>
                        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                            <span className="text-sm font-bold text-slate-700">เงินที่ควรมี (Expected)</span>
                            <span className="text-base font-black tabular-nums text-slate-800">{money(summary.already_closed ? (summary.closed_recon?.expected_cash || 0) : expectedCash)}</span>
                        </div>

                        {/* เงินนับจริง */}
                        <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-sm text-slate-500">เงินนับจริง (Actual)</span>
                            {summary.already_closed ? (
                                <span className="text-sm font-bold tabular-nums">{summary.closed_recon?.actual_cash != null ? money(summary.closed_recon.actual_cash) : "—"}</span>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => setShowDenom(true)} type="button"
                                        className="h-9 px-2 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1 shrink-0">
                                        <Calculator className="h-3.5 w-3.5" /> นับแบงก์
                                    </button>
                                    <div className="relative w-28">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">฿</span>
                                        <input value={actualCash} onChange={(e) => setActualCash(e.target.value.replace(/[^\d.]/g, ""))}
                                            inputMode="decimal" placeholder="นับเอง"
                                            className="w-full h-9 rounded-lg border border-slate-300 pl-6 pr-2 text-right text-sm font-bold tabular-nums focus:border-emerald-500 focus:outline-none" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Over / Short */}
                        {(() => {
                            const os = summary.already_closed ? (summary.closed_recon?.actual_cash != null ? (summary.closed_recon?.over_short ?? null) : null) : overShort;
                            if (os == null) return null;
                            const isOk = Math.abs(os) < 0.01;
                            return (
                                <div className={cn("flex items-center justify-between rounded-lg px-3 py-2 mt-1",
                                    isOk ? "bg-emerald-50" : os > 0 ? "bg-amber-50" : "bg-rose-50")}>
                                    <span className={cn("text-sm font-bold", isOk ? "text-emerald-700" : os > 0 ? "text-amber-700" : "text-rose-700")}>
                                        {isOk ? "✓ ตรงพอดี" : os > 0 ? "เงินเกิน" : "เงินขาด"}
                                    </span>
                                    <span className={cn("text-base font-black tabular-nums", isOk ? "text-emerald-700" : os > 0 ? "text-amber-700" : "text-rose-700")}>
                                        {os > 0 ? "+" : ""}{money(os)}
                                    </span>
                                </div>
                            );
                        })()}

                        {/* recon note */}
                        {summary.already_closed ? (
                            summary.closed_recon?.recon_note && <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">📝 {summary.closed_recon.recon_note}</p>
                        ) : (overShort != null && Math.abs(overShort) >= 0.01 && (
                            <input value={reconNote} onChange={(e) => setReconNote(e.target.value)}
                                placeholder="หมายเหตุ (อธิบายเงินขาด/เกิน)"
                                className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:outline-none mt-1" />
                        ))}
                    </div>

                    {/* Transfer + Credit column */}
                    <div className="space-y-3">
                        <ChannelReconCard icon={ArrowLeftRight} iconColor="text-blue-600" title="เงินโอน (K Shop)"
                            total={summary.transfer_total} count={summary.transfer_count} hint="เทียบยอด+จำนวนรายการกับแอป K Shop"
                            closed={summary.already_closed} closedActual={summary.closed_recon?.transfer_actual ?? null}
                            actualValue={transferActual} onActual={setTransferActual} overShort={transferOverShort} />
                        <ChannelReconCard icon={CreditCard} iconColor="text-violet-600" title="บัตรเครดิต"
                            total={summary.credit_total} count={summary.credit_count} hint="เทียบกับยอดสรุปเครื่องรูดบัตร (EDC)"
                            closed={summary.already_closed} closedActual={summary.closed_recon?.credit_actual ?? null}
                            actualValue={creditActual} onActual={setCreditActual} overShort={creditOverShort} />
                    </div>
                </div>
            </div>

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

                    <div className="mt-4 flex items-center justify-end gap-3">
                        {!hasPending && !reconReady && (
                            <span className="text-xs text-amber-600 font-medium inline-flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5" /> กรอก &quot;เงินนับจริง&quot; ให้ครบทุกช่องทาง ก่อนปิดยอด
                            </span>
                        )}
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

            {/* ส่วนลดของวันนี้ (ดูก่อนปิดยอด) */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200/60 flex items-center gap-2">
                    <Coins className="h-4 w-4 text-slate-600" />
                    <h2 className="text-base font-bold text-slate-800">ส่วนลดวันนี้</h2>
                    {discounts.total > 0 && (
                        <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded",
                            discounts.pctOfRevenue >= DISCOUNT_ALERT_PCT ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                        )}>
                            {discounts.pctOfRevenue}% ของรายรับ
                        </span>
                    )}
                </div>

                {discounts.total === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-slate-500">วันนี้ยังไม่มีการให้ส่วนลด</div>
                ) : (
                    <div className="p-5 space-y-3">
                        {discounts.pctOfRevenue >= DISCOUNT_ALERT_PCT && (
                            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>
                                    <b>ส่วนลดสูงผิดปกติ</b> — วันนี้ให้ส่วนลดรวม {money(discounts.total)} คิดเป็น {discounts.pctOfRevenue}%
                                    ของรายรับ (เกณฑ์เตือน {DISCOUNT_ALERT_PCT}%) ตรวจสอบก่อนปิดยอด
                                </span>
                            </div>
                        )}

                        <div className="flex items-baseline justify-between border-b border-slate-100 pb-2">
                            <span className="text-sm font-bold text-slate-700">ส่วนลดรวม</span>
                            <span className="text-2xl font-black text-red-600 tabular-nums">{money(discounts.total)}</span>
                        </div>

                        <div className="space-y-1.5">
                            {discounts.byType.map(t => (
                                <div key={t.type} className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600">
                                        {DISCOUNT_KIND_LABEL[t.type as keyof typeof DISCOUNT_KIND_LABEL] || t.type}
                                        <span className="text-xs text-slate-400 ml-1.5">({t.count} รายการ)</span>
                                    </span>
                                    <span className="font-semibold tabular-nums text-slate-800">{money(t.amount)}</span>
                                </div>
                            ))}
                        </div>

                        {discounts.topStaff.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500 mb-1.5">ให้ส่วนลดโดย</div>
                                <div className="space-y-1">
                                    {discounts.topStaff.map((s, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <span className="text-slate-600">{s.name} <span className="text-slate-400">({s.count})</span></span>
                                            <span className="font-semibold tabular-nums text-slate-700">{money(s.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* รูปแบบเงินขาด/เกิน รายพนักงาน */}
            {staffPattern.length > 0 && (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200/60 flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-600" />
                        <h2 className="text-base font-bold text-slate-800">รูปแบบเงินขาด/เกิน รายพนักงาน</h2>
                        <span className="text-xs text-slate-400">(จากการปิดยอดที่นับเงินจริง)</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {staffPattern.map((s, i) => {
                            const alert = s.closes >= 3 && (s.shortRate >= 0.5 || s.netOverShort <= -100);
                            return (
                                <div key={i} className="px-5 py-3 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            {s.name}
                                            {alert && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> เฝ้าระวัง</span>}
                                        </div>
                                        <div className="text-xs text-slate-500">ปิดยอด {s.closes} ครั้ง · เงินขาด {s.shortCount} ครั้ง ({Math.round(s.shortRate * 100)}%)</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className={cn("text-base font-black tabular-nums", s.netOverShort < 0 ? "text-rose-600" : s.netOverShort > 0 ? "text-amber-600" : "text-slate-400")}>
                                            {s.netOverShort > 0 ? "+" : ""}{money(s.netOverShort)}
                                        </div>
                                        <div className="text-[11px] text-slate-400">สะสมขาด/เกิน</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="px-5 py-2 text-[11px] text-slate-400 bg-slate-50/50">ป้าย &quot;เฝ้าระวัง&quot; = ปิดยอด ≥3 ครั้ง และเงินขาดเกินครึ่ง หรือยอดสะสมขาด ≥ ฿100</p>
                </div>
            )}

            {/* Denomination counter modal */}
            {showDenom && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900 inline-flex items-center gap-2"><Calculator className="h-5 w-5 text-emerald-600" /> นับเงินจากลิ้นชัก</h3>
                            <button onClick={() => setShowDenom(false)} className="rounded-lg p-1.5 hover:bg-slate-100"><X className="h-5 w-5 text-slate-500" /></button>
                        </div>
                        <div className="space-y-1.5">
                            {DENOMS.map((d) => {
                                const c = Number(denom[d]) || 0;
                                return (
                                    <div key={d} className="flex items-center gap-2">
                                        <span className="w-14 text-sm font-bold text-slate-600 text-right">฿{d.toLocaleString()}</span>
                                        <span className="text-slate-300">×</span>
                                        <input value={denom[d] || ""} onChange={(e) => setDenom({ ...denom, [d]: e.target.value.replace(/[^\d]/g, "") })}
                                            inputMode="numeric" placeholder="0"
                                            className="w-20 h-9 rounded-lg border border-slate-300 px-2 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none" />
                                        <span className="text-slate-400 text-sm">=</span>
                                        <span className="flex-1 text-right text-sm font-bold tabular-nums text-slate-700">{money(c * d)}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                            <span className="text-sm font-bold text-slate-700">รวมนับได้</span>
                            <span className="text-xl font-black tabular-nums text-emerald-700">{money(denomTotal)}</span>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button variant="outline" onClick={() => setDenom({})} className="rounded-xl">ล้าง</Button>
                            <Button onClick={() => { setActualCash(String(denomTotal)); setShowDenom(false); }} className="rounded-xl flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">ใช้ยอดนี้เป็นเงินนับจริง</Button>
                        </div>
                    </div>
                </div>
            )}

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
                                <span className="text-slate-600">เงินสด ควรมี / นับจริง</span>
                                <span className="font-bold tabular-nums">{money(expectedCash)} / {actualNum != null ? money(actualNum) : "—"}</span>
                            </div>
                            {overShort != null && Math.abs(overShort) >= 0.01 && (
                                <div className="flex justify-between">
                                    <span className="text-slate-600">{overShort > 0 ? "เงินเกิน" : "เงินขาด"}</span>
                                    <span className={cn("font-black tabular-nums", overShort > 0 ? "text-amber-700" : "text-rose-600")}>{overShort > 0 ? "+" : ""}{money(overShort)}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-slate-600">โอน / บัตร</span>
                                <span className="font-bold tabular-nums">{money(summary.transfer_total)} ({summary.transfer_count}) / {money(summary.credit_total)} ({summary.credit_count})</span>
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

function ChannelReconCard({
    icon: Icon, iconColor, title, total, count, hint, closed, closedActual, actualValue, onActual, overShort,
}: {
    icon: React.ElementType; iconColor: string; title: string; total: number; count: number; hint: string;
    closed: boolean; closedActual: number | null; actualValue: string; onActual: (v: string) => void; overShort: number | null;
}) {
    return (
        <div className="rounded-2xl border border-slate-200/70 p-4">
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-2">
                <Icon className={`h-4 w-4 ${iconColor}`} /> {title}
            </div>
            <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black tabular-nums text-slate-800">{money(total)}</span>
                <span className="text-sm font-semibold text-slate-500">{count} รายการ</span>
            </div>
            {closed ? (
                closedActual != null && (
                    <div className="mt-2 flex justify-between text-xs"><span className="text-slate-500">นับจริง</span><span className="font-bold tabular-nums">{money(closedActual)}</span></div>
                )
            ) : total > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-500 shrink-0">นับจริง</span>
                    <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">฿</span>
                        <input value={actualValue} onChange={(e) => onActual(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="เทียบกับสรุป"
                            className="w-full h-8 rounded-lg border border-slate-300 pl-5 pr-2 text-right text-sm font-bold tabular-nums focus:border-blue-500 focus:outline-none" />
                    </div>
                </div>
            ) : null}
            {overShort != null && Math.abs(overShort) >= 0.01 && (
                <p className={`text-[11px] font-bold mt-1.5 ${overShort > 0 ? "text-amber-600" : "text-rose-600"}`}>
                    {overShort > 0 ? "เกิน" : "ขาด"} {money(overShort)} — เช็คกับ {title.includes("โอน") ? "K Shop" : "EDC"}
                </p>
            )}
            <p className="text-[11px] text-slate-400 mt-1.5">{hint}</p>
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

function formatDateLong(d: string): string {
    try {
        const date = new Date(d + "T00:00:00");
        return date.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
