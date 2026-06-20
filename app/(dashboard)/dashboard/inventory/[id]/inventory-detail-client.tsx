"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, Plus, Minus, Edit3, Package, AlertTriangle, History, X,
    TrendingUp, TrendingDown, CheckCircle, AlertCircle,
} from "lucide-react";
import { receiveStock, adjustStock } from "@/lib/actions/inventory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { item: any; history: any[] }

const TX_TYPE_LABEL: Record<string, string> = {
    PO_RECEIVE: "รับเข้า (PO)",
    TRANSFER_IN: "โอนเข้า",
    ADJUST_IN: "ปรับเพิ่ม",
    RETURN_FROM_PATIENT: "คืนจากคนไข้",
    OPENING_STOCK: "ยอดยกมา",
    PRESCRIPTION: "จ่ายยา (Rx)",
    SUPPLY_PRESET: "หัตถการ",
    INVOICE: "ใบเสร็จ",
    INTERNAL_USE: "ใช้ในคลินิก",
    WASTE: "ทิ้ง / หมดอายุ",
    RECALL: "เรียกคืน",
    TRANSFER_OUT: "โอนออก",
    ADJUST_OUT: "ปรับลด",
    SAMPLE_GIVE: "แจกตัวอย่าง",
    LOT_CONVERT: "แปลง Lot",
    RECOUNT: "นับใหม่",
};

const CATEGORY_LABEL: Record<string, string> = {
    drug: "ยา",
    supply: "เวชภัณฑ์",
    service: "บริการ",
    equipment: "อุปกรณ์",
    other: "อื่นๆ",
};

export default function InventoryDetailClient({ item, history }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showReceive, setShowReceive] = useState(false);
    const [showAdjust, setShowAdjust] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const isLow = item.min_stock > 0 && Number(item.stock_qty) <= Number(item.min_stock);
    // มูลค่าสต๊อก (Inventory Value) — คิดจากต้นทุน (cost) ไม่ใช่ราคาขาย
    const stockValue = Number(item.cost_price || 0) * Number(item.stock_qty || 0);

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <Link href="/dashboard/inventory">
                        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 h-9 text-slate-600 hover:text-slate-800">
                            <ArrowLeft className="h-4 w-4" /> กลับ
                        </Button>
                    </Link>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">{item.item_code || "—"}</span>
                    <span className="font-bold text-slate-800">{item.item_name}</span>
                    {!item.is_active && <Badge className="bg-slate-200 text-slate-600 border-0">ปิดใช้งาน</Badge>}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setShowReceive(true)}
                        className="rounded-xl gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20"
                    >
                        <Plus className="h-4 w-4" /> รับยาเข้า
                    </Button>
                    <Button
                        onClick={() => setShowAdjust(true)}
                        variant="outline"
                        className="rounded-xl gap-1.5 h-9 border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                        <Edit3 className="h-4 w-4" /> ปรับสต๊อก
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

                {/* ═══ LEFT — Info + History ═══ */}
                <div className="space-y-4">
                    {/* Info card */}
                    <div className="gonix-card-premium p-5">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/60">
                            <Package className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">ข้อมูลรายการ</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">ชื่อสามัญ</div>
                                <div className="font-semibold">{item.generic_name || "—"}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">หมวด</div>
                                <div className="font-semibold">{CATEGORY_LABEL[item.category] || item.category}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">รูปแบบ</div>
                                <div className="font-semibold">{item.dosage_form || "—"}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">ความแรง</div>
                                <div className="font-semibold">{item.strength || "—"}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">หน่วย</div>
                                <div className="font-semibold">{item.unit}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">หน่วยซื้อ</div>
                                <div className="font-semibold">{item.purchase_unit || item.unit} (×{item.conversion_factor || 1})</div>
                            </div>
                            {item.indication && (
                                <div className="col-span-2">
                                    <div className="text-[11px] text-slate-500 uppercase tracking-wider">ข้อบ่งใช้</div>
                                    <div className="text-sm text-slate-700">{item.indication}</div>
                                </div>
                            )}
                            {item.warning_label && (
                                <div className="col-span-2">
                                    <div className="text-[11px] text-red-600 uppercase tracking-wider font-bold">⚠ คำเตือน</div>
                                    <div className="text-sm text-red-700 font-semibold">{item.warning_label}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* History */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200/60 bg-slate-50/40">
                            <History className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">ประวัติการเคลื่อนไหว</h2>
                            <span className="text-xs text-slate-500">({history.length} รายการ)</span>
                        </div>
                        {history.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-500">ยังไม่มีประวัติการเคลื่อนไหว</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2">วันที่</th>
                                            <th className="text-left px-4 py-2">ประเภท</th>
                                            <th className="text-right px-4 py-2 w-20">+/-</th>
                                            <th className="text-right px-4 py-2 w-20">คงเหลือ</th>
                                            <th className="text-left px-4 py-2">หมายเหตุ</th>
                                            <th className="text-left px-4 py-2 hidden md:table-cell">ผู้บันทึก</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((h) => {
                                            const isPositive = Number(h.qty_delta) >= 0;
                                            const recorder = Array.isArray(h.recorded_by) ? h.recorded_by[0] : h.recorded_by;
                                            const recorderName = recorder?.profiles?.full_name || recorder?.profiles?.[0]?.full_name || "—";
                                            return (
                                                <tr key={h.id} className="border-t border-slate-100">
                                                    <td className="px-4 py-2 text-xs text-slate-600 tabular-nums">
                                                        {new Date(h.recorded_at).toLocaleString("th-TH", {
                                                            day: "numeric", month: "short", year: "2-digit",
                                                            hour: "2-digit", minute: "2-digit",
                                                        })}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <span className="text-[11px] font-bold text-slate-700">
                                                            {TX_TYPE_LABEL[h.tx_type] || h.tx_type}
                                                        </span>
                                                    </td>
                                                    <td className={`px-4 py-2 text-right font-bold tabular-nums ${isPositive ? "text-emerald-700" : "text-rose-600"}`}>
                                                        <span className="inline-flex items-center gap-0.5 justify-end">
                                                            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                            {isPositive ? "+" : ""}{Number(h.qty_delta).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                                                        {Number(h.balance_after).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-2 text-xs text-slate-600 max-w-[200px] truncate" title={h.note || ""}>
                                                        {h.ref_vn && <span className="font-mono text-blue-700 mr-1">{h.ref_vn}</span>}
                                                        {h.note || "—"}
                                                    </td>
                                                    <td className="px-4 py-2 text-xs text-slate-600 hidden md:table-cell">{recorderName}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ RIGHT — Stock summary ═══ */}
                <div className="lg:sticky lg:top-4 space-y-3">
                    <div className={`gonix-card-premium p-5 ${isLow ? "ring-2 ring-red-200" : ""}`}>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">คงเหลือ</div>
                        <div className={`text-4xl font-black tabular-nums mt-1 ${isLow ? "text-red-700" : "text-slate-800"}`}>
                            {Number(item.stock_qty || 0).toLocaleString()}
                            <span className="text-lg text-slate-500 font-normal ml-2">{item.unit}</span>
                        </div>
                        {isLow && (
                            <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
                                <AlertTriangle className="h-3 w-3" />
                                สต๊อกต่ำกว่าจุดสั่งซื้อ ({item.min_stock})
                            </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-slate-200/60 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">จุดสั่งซื้อ (Min)</span>
                                <span className="font-semibold tabular-nums">{Number(item.min_stock || 0).toLocaleString()} {item.unit}</span>
                            </div>
                            {item.expiry_date && (() => {
                                const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) + "T00:00:00");
                                const exp = new Date(item.expiry_date + "T00:00:00");
                                const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
                                const cls = days < 0 ? "text-red-700" : days <= 90 ? "text-orange-700" : "text-slate-800";
                                return (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">วันหมดอายุ</span>
                                        <span className={`font-bold tabular-nums ${cls}`}>
                                            {new Date(item.expiry_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                            {days < 0 ? ` · หมดแล้ว ${Math.abs(days)} วัน` : days <= 90 ? ` · เหลือ ${days} วัน` : ""}
                                        </span>
                                    </div>
                                );
                            })()}
                            <div className="flex justify-between">
                                <span className="text-slate-500">ราคาทุน</span>
                                <span className="font-semibold tabular-nums">฿{Number(item.cost_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">ราคาขาย</span>
                                <span className="font-bold text-emerald-700 tabular-nums">฿{Number(item.sell_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-slate-200/60">
                                <span className="text-slate-500">มูลค่าสต๊อก</span>
                                <span className="font-bold text-slate-800 tabular-nums">฿{stockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Receive Modal */}
            {showReceive && (
                <ReceiveModal
                    itemId={item.id}
                    itemName={item.item_name}
                    unit={item.unit}
                    currentStock={Number(item.stock_qty || 0)}
                    onClose={() => setShowReceive(false)}
                    onSuccess={(qty) => {
                        setSuccess(`✓ รับเข้าสต๊อก ${qty} ${item.unit} สำเร็จ`);
                        setShowReceive(false);
                        startTransition(() => router.refresh());
                    }}
                    onError={setError}
                />
            )}

            {/* Adjust Modal */}
            {showAdjust && (
                <AdjustModal
                    itemId={item.id}
                    itemName={item.item_name}
                    unit={item.unit}
                    currentStock={Number(item.stock_qty || 0)}
                    onClose={() => setShowAdjust(false)}
                    onSuccess={() => {
                        setSuccess(`✓ ปรับสต๊อกสำเร็จ`);
                        setShowAdjust(false);
                        startTransition(() => router.refresh());
                    }}
                    onError={setError}
                />
            )}
        </div>
    );
}

function ReceiveModal({
    itemId, itemName, unit, currentStock, onClose, onSuccess, onError,
}: {
    itemId: string;
    itemName: string;
    unit: string;
    currentStock: number;
    onClose: () => void;
    onSuccess: (qty: number) => void;
    onError: (msg: string) => void;
}) {
    const [qty, setQty] = useState("");
    const [cost, setCost] = useState("");
    const [lot, setLot] = useState("");
    const [note, setNote] = useState("");
    const [pending, startTransition] = useTransition();

    function handleSubmit() {
        const q = parseFloat(qty);
        if (!q || q <= 0) {
            onError("กรุณากรอกจำนวนที่รับเข้า");
            return;
        }
        startTransition(async () => {
            const res = await receiveStock({
                item_id: itemId,
                qty: q,
                cost_per_unit: cost ? parseFloat(cost) : undefined,
                note: note || undefined,
                lot_no: lot || undefined,
            });
            if (!res.success) {
                onError(res.error || "Error");
                return;
            }
            onSuccess(q);
        });
    }

    const newStock = currentStock + (parseFloat(qty) || 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Plus className="h-5 w-5 text-emerald-700" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">รับยาเข้า</h3>
                            <p className="text-xs text-slate-500 truncate">{itemName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">จำนวน *</Label>
                    <div className="flex items-center gap-2 mt-1">
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={qty}
                            onChange={e => setQty(e.target.value)}
                            placeholder="0"
                            className="text-right text-base font-bold tabular-nums"
                        />
                        <span className="text-sm text-slate-500 shrink-0">{unit}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                        คงเหลือเดิม: <span className="font-bold tabular-nums">{currentStock.toLocaleString()}</span>
                        {qty && (
                            <> → ใหม่: <span className="font-bold text-emerald-700 tabular-nums">{newStock.toLocaleString()}</span> {unit}</>
                        )}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">ราคาทุน/หน่วย</Label>
                        <div className="relative mt-1">
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cost}
                                onChange={e => setCost(e.target.value)}
                                placeholder="0.00"
                                className="pl-7 text-right tabular-nums"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">฿</span>
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">Lot No.</Label>
                        <Input value={lot} onChange={e => setLot(e.target.value)} placeholder="—" className="mt-1 font-mono" />
                    </div>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">หมายเหตุ</Label>
                    <Input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น Supplier, PO#..." className="mt-1" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={pending || !qty}
                        className="rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/25"
                    >
                        <Plus className="h-4 w-4" />
                        {pending ? "กำลังรับเข้า..." : "ยืนยันรับเข้า"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function AdjustModal({
    itemId, itemName, unit, currentStock, onClose, onSuccess, onError,
}: {
    itemId: string;
    itemName: string;
    unit: string;
    currentStock: number;
    onClose: () => void;
    onSuccess: () => void;
    onError: (msg: string) => void;
}) {
    const [newQty, setNewQty] = useState(currentStock.toString());
    const [reason, setReason] = useState("");
    const [txType, setTxType] = useState<"RECOUNT" | "WASTE" | "ADJUST_OUT" | "ADJUST_IN">("RECOUNT");
    const [pending, startTransition] = useTransition();

    const n = parseFloat(newQty) || 0;
    const delta = n - currentStock;

    function handleSubmit() {
        if (!reason.trim()) {
            onError("กรุณาระบุเหตุผล");
            return;
        }
        if (n < 0) {
            onError("จำนวนต้องไม่ติดลบ");
            return;
        }
        startTransition(async () => {
            const res = await adjustStock({
                item_id: itemId,
                new_qty: n,
                reason: reason.trim(),
                tx_type: txType,
            });
            if (!res.success) {
                onError(res.error || "Error");
                return;
            }
            onSuccess();
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Edit3 className="h-5 w-5 text-amber-700" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">ปรับสต๊อก</h3>
                            <p className="text-xs text-slate-500 truncate">{itemName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">ประเภท</Label>
                    <select
                        value={txType}
                        onChange={e => setTxType(e.target.value as "RECOUNT" | "WASTE" | "ADJUST_OUT" | "ADJUST_IN")}
                        className="mt-1 flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    >
                        <option value="RECOUNT">นับใหม่ (RECOUNT)</option>
                        <option value="WASTE">ทิ้ง / หมดอายุ (WASTE)</option>
                        <option value="ADJUST_OUT">ปรับลด (ของหาย)</option>
                        <option value="ADJUST_IN">ปรับเพิ่ม</option>
                    </select>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">จำนวนใหม่ (หลังนับ) *</Label>
                    <div className="flex items-center gap-2 mt-1">
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={newQty}
                            onChange={e => setNewQty(e.target.value)}
                            className="text-right text-base font-bold tabular-nums"
                        />
                        <span className="text-sm text-slate-500 shrink-0">{unit}</span>
                    </div>
                    <p className="text-[11px] mt-1">
                        เดิม: <span className="font-bold tabular-nums text-slate-700">{currentStock.toLocaleString()}</span>
                        <> → ใหม่: <span className="font-bold tabular-nums text-slate-700">{n.toLocaleString()}</span></>
                        {delta !== 0 && (
                            <span className={`ml-2 font-bold ${delta > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                                ({delta > 0 ? "+" : ""}{delta.toLocaleString()})
                            </span>
                        )}
                    </p>
                </div>

                <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">เหตุผล *</Label>
                    <Input
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="เช่น นับสต๊อกประจำเดือน, ยาหมดอายุ, ของหายระหว่างขนส่ง"
                        className="mt-1"
                    />
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    ⚠ การปรับสต๊อกจะบันทึก audit log — ผู้ตรวจสอบจะดูได้ภายหลัง
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={pending || !reason.trim() || delta === 0}
                        className="rounded-xl gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/25"
                    >
                        <Edit3 className="h-4 w-4" />
                        {pending ? "กำลังปรับ..." : "ยืนยันปรับ"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
