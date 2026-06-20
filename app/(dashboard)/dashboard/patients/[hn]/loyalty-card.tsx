"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Award, Plus, Gift, History, Loader2, X, AlertCircle,
    TrendingUp, TrendingDown, Settings, Calendar,
} from "lucide-react";
import {
    getLoyaltySnapshot, getLoyaltyHistory,
    awardPoints, redeemPoints, adjustPoints,
} from "@/lib/actions/loyalty";

interface Props {
    hn: string;
    visitCount: number;
}

const TIER_STYLES: Record<string, { gradient: string; bg: string; ring: string; text: string }> = {
    Bronze: { gradient: "from-amber-700 to-orange-800", bg: "from-amber-50 to-orange-50", ring: "ring-amber-700/30", text: "text-amber-900" },
    Silver: { gradient: "from-slate-400 to-slate-600", bg: "from-slate-50 to-slate-100", ring: "ring-slate-400/40", text: "text-slate-700" },
    Gold: { gradient: "from-yellow-400 to-amber-500", bg: "from-yellow-50 to-amber-50", ring: "ring-yellow-500/40", text: "text-amber-800" },
    Platinum: { gradient: "from-indigo-500 via-purple-500 to-pink-500", bg: "from-indigo-50 to-purple-50", ring: "ring-purple-500/40", text: "text-purple-800" },
};

type Snapshot = Awaited<ReturnType<typeof getLoyaltySnapshot>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Txn = any;

export default function LoyaltyCard({ hn, visitCount }: Props) {
    const router = useRouter();
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState<"award" | "redeem" | "history" | "adjust" | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const data = await getLoyaltySnapshot(hn);
        setSnapshot(data);
        setLoading(false);
    }, [hn]);

    useEffect(() => { load(); }, [load]);

    if (loading || !snapshot) {
        return (
            <div className="p-5 flex items-center justify-center min-h-[260px]">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        );
    }

    const { balance, current, next, pointsToNext, progressPct, nextExpiry } = snapshot;
    const tierStyle = TIER_STYLES[current.name] || TIER_STYLES.Bronze;
    const nextStyle = next ? TIER_STYLES[next.name] : tierStyle;

    return (
        <div className="p-5 flex items-center justify-center">
            <div className={`w-full rounded-3xl bg-gradient-to-br ${tierStyle.bg} border border-white/80 ring-1 ${tierStyle.ring} shadow-sm p-5 relative overflow-hidden`}>
                {/* Decorative coin */}
                <div className={`absolute -top-8 -right-8 h-32 w-32 rounded-full bg-gradient-to-br ${tierStyle.gradient} opacity-10 pointer-events-none`} />

                {/* Header */}
                <div className="flex items-center justify-between relative">
                    <div className="flex items-center gap-1.5">
                        <Award className={`h-3.5 w-3.5 ${tierStyle.text}`} />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                            Loyalty Points
                        </span>
                    </div>
                    <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r ${tierStyle.gradient} text-white text-[11px] font-bold shadow-sm`}>
                        ⭐ {current.name}
                    </div>
                </div>

                {/* Points */}
                <div className="relative mt-3">
                    <div className="flex items-baseline gap-2">
                        <span className={`text-5xl font-black tracking-tight ${tierStyle.text}`}>
                            {balance.toLocaleString("th-TH")}
                        </span>
                        <span className="text-sm font-semibold text-slate-600">คะแนน</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        จากการเข้ารับบริการ {visitCount} ครั้ง
                    </p>
                </div>

                {/* Progress to next tier */}
                {next && (
                    <div className="relative mt-4">
                        <div className="flex items-baseline justify-between text-[11px]">
                            <span className="text-slate-600 font-medium">ระดับถัดไป</span>
                            <span className="font-bold text-slate-700">
                                เหลืออีก {pointsToNext.toLocaleString("th-TH")} คะแนน
                            </span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-white/80 overflow-hidden">
                            <div
                                className={`h-full rounded-full bg-gradient-to-r ${nextStyle.gradient} transition-all`}
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500 text-right">
                            ถึง <strong className="text-slate-700">{next.name}</strong>
                        </div>
                    </div>
                )}

                {/* Expiry */}
                {nextExpiry && (
                    <div className="relative mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/60 border border-slate-200/60 text-[11px] text-slate-600">
                        <Calendar className="h-3 w-3" />
                        คะแนนหมดอายุ {new Date(nextExpiry).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                )}

                {/* Action buttons */}
                <div className="relative mt-4 pt-3 border-t border-white/60 grid grid-cols-3 gap-2">
                    <button onClick={() => setModalOpen("award")}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/70 hover:bg-white border border-white/80 transition-colors">
                        <Plus className="h-4 w-4 text-emerald-600" />
                        <span className="text-[10px] font-semibold text-slate-700">เพิ่มคะแนน</span>
                    </button>
                    <button onClick={() => setModalOpen("redeem")}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/70 hover:bg-white border border-white/80 transition-colors">
                        <Gift className="h-4 w-4 text-pink-600" />
                        <span className="text-[10px] font-semibold text-slate-700">แลกคะแนน</span>
                    </button>
                    <button onClick={() => setModalOpen("history")}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/70 hover:bg-white border border-white/80 transition-colors">
                        <History className="h-4 w-4 text-blue-600" />
                        <span className="text-[10px] font-semibold text-slate-700">ประวัติ</span>
                    </button>
                </div>
            </div>

            {/* Modals */}
            {modalOpen === "award" && (
                <AwardModal hn={hn} onClose={() => { setModalOpen(null); load(); router.refresh(); }} />
            )}
            {modalOpen === "redeem" && (
                <RedeemModal hn={hn} balance={balance} onClose={() => { setModalOpen(null); load(); router.refresh(); }} />
            )}
            {modalOpen === "history" && (
                <HistoryModal hn={hn} onClose={() => setModalOpen(null)} onAdjust={() => setModalOpen("adjust")} />
            )}
            {modalOpen === "adjust" && (
                <AdjustModal hn={hn} onClose={() => { setModalOpen(null); load(); router.refresh(); }} />
            )}
        </div>
    );
}

/* ═══════ Modals ═══════ */

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                    <h3 className="text-base font-bold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>,
        document.body
    );
}

function AwardModal({ hn, onClose }: { hn: string; onClose: () => void }) {
    const [points, setPoints] = useState("");
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit() {
        const n = parseInt(points);
        if (!n || n <= 0) { setError("กรุณาระบุจำนวนคะแนน"); return; }
        setLoading(true); setError("");
        const res = await awardPoints(hn, n, note || undefined);
        setLoading(false);
        if (!res.success) { setError(res.error || "Error"); return; }
        onClose();
    }

    return (
        <ModalShell title="เพิ่มคะแนน" onClose={onClose}>
            {error && <div className="mb-3 px-3 py-2 rounded bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
            <div className="space-y-3">
                <div>
                    <Label className="text-xs font-semibold text-slate-600">จำนวนคะแนน</Label>
                    <Input type="number" min={1} value={points} onChange={e => setPoints(e.target.value)}
                        placeholder="เช่น 50" className="mt-1 h-10 rounded-xl text-lg font-bold tabular-nums" />
                </div>
                <div>
                    <Label className="text-xs font-semibold text-slate-600">หมายเหตุ (optional)</Label>
                    <Input value={note} onChange={e => setNote(e.target.value)}
                        placeholder="เช่น โบนัสจากโปรโมชั่น" className="mt-1 h-10 rounded-xl" />
                </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                <Button onClick={handleSubmit} disabled={loading} className="rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    เพิ่มคะแนน
                </Button>
            </div>
        </ModalShell>
    );
}

function RedeemModal({ hn, balance, onClose }: { hn: string; balance: number; onClose: () => void }) {
    const [points, setPoints] = useState("");
    const [item, setItem] = useState("");
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const presets = [
        { points: 50, label: "ส่วนลด 50 บาท" },
        { points: 100, label: "ส่วนลด 100 บาท" },
        { points: 200, label: "ตรวจฟรี 1 ครั้ง" },
        { points: 500, label: "ส่วนลด 500 บาท" },
    ];

    async function handleSubmit() {
        const n = parseInt(points);
        if (!n || n <= 0) { setError("กรุณาระบุจำนวนคะแนน"); return; }
        if (!item.trim()) { setError("กรุณาระบุรายการที่แลก"); return; }
        setLoading(true); setError("");
        const res = await redeemPoints(hn, n, item, note || undefined);
        setLoading(false);
        if (!res.success) { setError(res.error || "Error"); return; }
        onClose();
    }

    return (
        <ModalShell title="แลกคะแนน" onClose={onClose}>
            <div className="mb-3 px-3 py-2 rounded-lg bg-pink-50 border border-pink-200 text-sm">
                คะแนนคงเหลือ <strong className="text-pink-700 tabular-nums">{balance.toLocaleString("th-TH")}</strong> คะแนน
            </div>
            {error && <div className="mb-3 px-3 py-2 rounded bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

            {/* Presets */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                {presets.map(p => (
                    <button key={p.label} onClick={() => { setPoints(String(p.points)); setItem(p.label); }}
                        disabled={balance < p.points}
                        className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-pink-300 hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <div className="text-sm font-semibold text-slate-800">{p.label}</div>
                        <div className="text-xs text-slate-500">ใช้ {p.points} คะแนน</div>
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                <div>
                    <Label className="text-xs font-semibold text-slate-600">รายการที่แลก</Label>
                    <Input value={item} onChange={e => setItem(e.target.value)}
                        placeholder="เช่น ส่วนลด 100 บาท" className="mt-1 h-10 rounded-xl" />
                </div>
                <div>
                    <Label className="text-xs font-semibold text-slate-600">จำนวนคะแนนที่ใช้</Label>
                    <Input type="number" min={1} max={balance} value={points} onChange={e => setPoints(e.target.value)}
                        placeholder="เช่น 100" className="mt-1 h-10 rounded-xl text-lg font-bold tabular-nums" />
                </div>
                <div>
                    <Label className="text-xs font-semibold text-slate-600">หมายเหตุ (optional)</Label>
                    <Input value={note} onChange={e => setNote(e.target.value)}
                        placeholder="เช่น VN-...." className="mt-1 h-10 rounded-xl" />
                </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                <Button onClick={handleSubmit} disabled={loading} className="rounded-xl gap-1.5 bg-pink-600 hover:bg-pink-700">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                    ยืนยันการแลก
                </Button>
            </div>
        </ModalShell>
    );
}

function HistoryModal({ hn, onClose, onAdjust }: { hn: string; onClose: () => void; onAdjust: () => void }) {
    const [txns, setTxns] = useState<Txn[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    useEffect(() => {
        (async () => {
            const res = await getLoyaltyHistory(hn);
            if (res.success) setTxns(res.data);
            setLoading(false);
        })();
    }, [hn]);

    const txnLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
        earn: { label: "ได้รับ", color: "text-emerald-700 bg-emerald-50", icon: TrendingUp },
        redeem: { label: "แลก", color: "text-pink-700 bg-pink-50", icon: Gift },
        adjust: { label: "ปรับ", color: "text-blue-700 bg-blue-50", icon: Settings },
        expire: { label: "หมดอายุ", color: "text-slate-600 bg-slate-50", icon: TrendingDown },
    };

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                    <h3 className="text-base font-bold text-slate-800">ประวัติคะแนน</h3>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={onAdjust} className="rounded-lg gap-1.5 h-8 text-xs">
                            <Settings className="h-3.5 w-3.5" /> ปรับคะแนน (admin)
                        </Button>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-8 text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> กำลังโหลด...
                        </div>
                    ) : txns.length === 0 ? (
                        <p className="text-center text-sm text-slate-400 py-8">ยังไม่มีประวัติคะแนน</p>
                    ) : (
                        <div className="space-y-2">
                            {txns.map(t => {
                                const meta = txnLabels[t.txn_type] || txnLabels.earn;
                                const Icon = meta.icon;
                                const isExpired = t.txn_type === "earn" && t.expires_at && new Date(t.expires_at) < new Date();
                                const creator = Array.isArray(t.creator) ? t.creator[0] : t.creator;
                                return (
                                    <div key={t.id} className={`flex items-start gap-3 p-3 rounded-xl border border-slate-200/70 ${isExpired ? "opacity-60 bg-slate-50" : ""}`}>
                                        <div className={`h-8 w-8 rounded-lg ${meta.color} flex items-center justify-center shrink-0`}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.color}`}>
                                                    {meta.label}
                                                </span>
                                                {t.redeem_item && (
                                                    <span className="text-sm font-semibold text-slate-800">{t.redeem_item}</span>
                                                )}
                                                {t.vn && (
                                                    <span className="text-xs font-mono text-slate-500">{t.vn}</span>
                                                )}
                                                {isExpired && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                                        หมดอายุแล้ว
                                                    </span>
                                                )}
                                            </div>
                                            {t.note && <p className="text-xs text-slate-600 mt-0.5">{t.note}</p>}
                                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                                                <span>{new Date(t.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                                                {creator?.full_name && <><span>·</span><span>{creator.full_name}</span></>}
                                                {t.expires_at && t.txn_type === "earn" && !isExpired && (
                                                    <><span>·</span><span>หมดอายุ {new Date(t.expires_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span></>
                                                )}
                                            </div>
                                        </div>
                                        <div className={`text-lg font-extrabold tabular-nums shrink-0 ${t.points > 0 ? "text-emerald-700" : "text-pink-700"}`}>
                                            {t.points > 0 ? "+" : ""}{t.points.toLocaleString("th-TH")}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

function AdjustModal({ hn, onClose }: { hn: string; onClose: () => void }) {
    const [delta, setDelta] = useState("");
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit() {
        const n = parseInt(delta);
        if (!n || n === 0) { setError("ระบุจำนวนที่ต้องการปรับ (+ เพิ่ม / - ลด)"); return; }
        if (!note.trim()) { setError("ต้องระบุเหตุผลในการปรับ"); return; }
        setLoading(true); setError("");
        const res = await adjustPoints(hn, n, note);
        setLoading(false);
        if (!res.success) { setError(res.error || "Error"); return; }
        onClose();
    }

    return (
        <ModalShell title="ปรับคะแนน (Admin)" onClose={onClose}>
            <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
                💡 ใส่ค่า <strong>บวก (+)</strong> เพื่อเพิ่ม, <strong>ลบ (-)</strong> เพื่อลดคะแนน
            </div>
            {error && <div className="mb-3 px-3 py-2 rounded bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
            <div className="space-y-3">
                <div>
                    <Label className="text-xs font-semibold text-slate-600">จำนวนที่ปรับ (+/-)</Label>
                    <Input type="number" value={delta} onChange={e => setDelta(e.target.value)}
                        placeholder="เช่น 50 หรือ -20" className="mt-1 h-10 rounded-xl text-lg font-bold tabular-nums" />
                </div>
                <div>
                    <Label className="text-xs font-semibold text-slate-600">เหตุผล <span className="text-red-500">*</span></Label>
                    <Input value={note} onChange={e => setNote(e.target.value)}
                        placeholder="เช่น ปรับชดเชยจากระบบ" className="mt-1 h-10 rounded-xl" />
                </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} className="rounded-xl">ยกเลิก</Button>
                <Button onClick={handleSubmit} disabled={loading} className="rounded-xl gap-1.5">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                    ยืนยันการปรับ
                </Button>
            </div>
        </ModalShell>
    );
}
